# Mo'een — Instagram Integration (Phase 7)

> This document describes the Instagram Direct Messaging integration that **replaces WhatsApp** as Mo'een's primary customer channel. Read `03_ARCHITECTURE.md` and the Phase 3/4 sections of `CLAUDE.md` first — Instagram reuses most of that machinery.

> **Implementation status (code-complete):** Slices 1–4 are built and pass `typecheck`/`build`. Provider-agnostic core, `InstagramProvider`, single app-level webhook (`/api/webhooks/instagram`), generalized send path (+`HUMAN_AGENT` tag), OAuth connect/callback, token-refresh cron, settings UI, and WhatsApp retirement all landed. **Remaining before go-live:** run `011_instagram.sql`, set the `INSTAGRAM_*` env vars, configure the Meta app (Instagram Login + webhook), and clear **Business Verification + App Review** for `instagram_business_manage_messages`. Send endpoint uses Graph **v25.0** (was documented as v21.0). Verify all endpoints/scopes against live Meta docs at build time.

---

## Why Instagram Replaces WhatsApp

Most Palestinian/MENA small businesses run their storefront on Instagram — product photos in the feed and Stories, customers sliding into DMs with "بكم؟" (how much?). Instagram is where **discovery and the first order** happen, which is exactly where Mo'een's AI order extraction adds the most value.

| Reason | Detail |
|--------|--------|
| **Where merchants already are** | IG is the storefront for our target segment; WhatsApp is a secondary support layer |
| **Free messaging** | Instagram Messaging API has **no per-message fee** from Meta (WhatsApp charges per template outside the free window) |
| **Lower onboarding friction** | OAuth "Connect with Instagram" vs. pasting four WhatsApp credentials |
| **Lead-gen mechanics** | Comment-to-DM, Story replies, and ads funnel straight into DMs — no phone number needed first |

**Competitive context:** Meta launched the **Meta Business Agent** (June 2026) — a free, in-app AI that answers DMs and takes orders on WhatsApp/IG/Messenger. Mo'een does not try to out-chat it. Mo'een's moat is the **structured order & inventory operating system behind the DMs** — real stock math, order lifecycle, flags, timeline, unified dashboard. The conversational layer is commoditized; the commerce layer is not.

---

## What Already Exists (Head Start)

Mo'een's data model was built channel-agnostic from day one. The database needs almost no change:

- `customers` keys on `(merchant_id, platform, platform_user_id)` — not phone. The Instagram-scoped user ID (**IGSID**) drops into `platform_user_id`.
- `conversations` has `platform` + `platform_chat_id`.
- `messages` has `platform_message_id` for idempotency — the same guarantee works for Instagram.
- `products` already has an `instagram_post_id` column — the hook for future Comment-to-DM (IG post → product).
- `MessagingProvider` interface (`src/lib/messaging/interface.ts`) is channel-neutral and is **kept** even though we are single-channel now. It is the seam that makes the AI pipeline provider-agnostic.

---

## Architectural Differences From WhatsApp

Instagram is **not** "WhatsApp with a different provider class." Four real differences drive the design:

| Aspect | WhatsApp (retired) | Instagram (new) |
|--------|--------------------|-----------------|
| **Auth** | BYO: merchant pastes phoneNumberId + access token + verify token | **OAuth** (Instagram Login). Long-lived token (~60 days) that must be **refreshed** |
| **Meta app** | Effectively one app per merchant (each configures their own) | **One Mo'een app** for all merchants, App-Review'd once |
| **Webhook** | One URL per merchant: `/api/webhooks/whatsapp/[merchantId]`, per-merchant verify token in path | **One app-level endpoint**: `/api/webhooks/instagram`. Events arrive keyed by IG account ID → resolve merchant by lookup |
| **Identity** | Phone number (human-readable) | IGSID (opaque). Fetch username/name via profile API |

### Behavioral rules to bake in

- **24-hour window** — the AI can only free-form reply within 24h of the customer's last message. The reactive pipeline naturally stays inside this, but late outbound/handoff sends will be **rejected** — detect window expiry and create a `customer_waiting` flag instead of failing silently.
- **Human Agent tag (7-day window)** — a **merchant (human)** reply may use the `HUMAN_AGENT` tag to extend to 7 days. The **AI must never** use this tag (policy violation). So: `sender_type: "merchant"` sends may pass `HUMAN_AGENT`; `sender_type: "ai"` sends must not.
- **No templates** — Instagram has no approved-template system. `sendTemplateMessage` is unsupported. There is no cheap re-engagement outside the window.
- **Rate limit** — ~200 automated DMs/hour per account. Not a concern at MVP scale, but the send path should degrade gracefully on 429s.

---

## Data Model Changes

### Migration `011_instagram.sql`

Add to `merchant_settings` (leave all `whatsapp_*` columns untouched — dropping them is destructive and pointless):

```sql
ALTER TABLE merchant_settings
  ADD COLUMN instagram_connected boolean DEFAULT false,
  ADD COLUMN instagram_user_id text,            -- IG business account ID (webhook lookup key)
  ADD COLUMN instagram_username text,
  ADD COLUMN instagram_access_token text,
  ADD COLUMN instagram_token_expires_at timestamptz;

-- Webhook → merchant resolution path
CREATE INDEX idx_merchant_settings_ig_user_id
  ON merchant_settings (instagram_user_id)
  WHERE instagram_user_id IS NOT NULL;
```

Everywhere else, reuse the existing `platform` columns with the value `"instagram"`.

---

## Provider Layer

### `src/lib/messaging/instagram.ts` — `InstagramProvider implements MessagingProvider`

| Method | Implementation |
|--------|----------------|
| `sendMessage(chatId, text)` | `POST https://graph.instagram.com/v25.0/{ig-user-id}/messages` with body `{ recipient: { id: chatId }, message: { text } }` |
| `receiveWebhook(payload)` | Parse IG's `entry[].messaging[]` shape (different from WA's `entry[].changes[].value.messages[]`). Extract `sender.id` (IGSID), `message.mid`, `message.text` |
| `getConversationHistory(chatId, limit)` | Same as WA but `platform="instagram"` |
| `sendTemplateMessage(...)` | Throws — Instagram has no template system |
| `static resolveProfile(igsid, token)` | Fetch `username`/`name` for a customer via the Graph API |

The retired `whatsapp.ts` stays in git history; it is dropped from active imports.

---

## OAuth Flow (Instagram Login)

Uses **Instagram API with Instagram Login** — no Facebook Page required.

```
Merchant clicks "Connect with Instagram" (settings)
        │
        ▼
GET /api/instagram/connect
  → redirect to https://www.instagram.com/oauth/authorize
     scope: instagram_business_basic, instagram_business_manage_messages
        │
        ▼  (merchant authorizes)
GET /api/auth/instagram/callback?code=...
  1. Exchange code → short-lived token (POST api.instagram.com/oauth/access_token)
  2. Short-lived → long-lived token, ~60 days (GET graph.instagram.com/access_token?grant_type=ig_exchange_token)
  3. Fetch IG user id + username
  4. Subscribe this account to the app's `messages` webhook field
  5. Save instagram_* fields to merchant_settings
        │
        ▼
Redirect back to /settings (connected state)
```

**Token refresh:** long-lived tokens expire in ~60 days and must be refreshed via `grant_type=ig_refresh_token` before expiry. Implement a scheduled refresh (cron route or n8n workflow) that refreshes tokens with `instagram_token_expires_at` within, say, 7 days of expiry.

> ⚠️ **Verify exact endpoints/scope names against current Meta docs at build time.** Meta renames scopes and bumps Graph API versions frequently (old IG scopes were deprecated Jan 2025). Do not hardcode from memory.

---

## Webhook — Single App-Level Endpoint

New route: `/api/webhooks/instagram` (no `[merchantId]` segment).

**GET** — verification challenge. Compare `hub.verify_token` against a single **app-level** verify token from env (`INSTAGRAM_WEBHOOK_VERIFY_TOKEN`), return `hub.challenge`.

**POST** — for each messaging event:
1. Parse via `InstagramProvider.receiveWebhook`.
2. **Resolve merchant** by looking up `merchant_settings.instagram_user_id` = the recipient IG account ID in the payload. (This replaces the `[merchantId]`-in-path model.)
3. From here, reuse the **exact** WhatsApp webhook body logic:
   - Idempotency check on `platform_message_id`
   - Customer upsert on `(merchant_id, "instagram", igsid)` — name from `resolveProfile` (fallback `@{igsid}`)
   - Conversation find/create with `platform="instagram"`
   - Save inbound message
   - Auto-acknowledge (fire-and-forget) if enabled
   - `after(() => processInboundMessage(...))`
4. Always return `200` (prevent Meta retry storms).

~80% of this is a copy of the current WhatsApp route.

---

## AI Pipeline Refactor (The Enabling Step)

The pipeline currently carries WhatsApp credentials in its type and news up `WhatsAppProvider` directly. Generalize it:

- **`PipelineInput`** (`src/lib/ai/types.ts`): replace `whatsappPhoneNumberId` / `whatsappAccessToken` with `platform: string` + a `credentials` object (opaque per provider).
- **`sendAIMessage()`** (`src/lib/ai/process.ts`): obtain the provider via a small factory `getProvider(platform, credentials)` instead of `new WhatsAppProvider(...)`. After this, `process.ts` never names a channel.
- **Window awareness**: if a send is rejected for being outside the 24h window, create a `customer_waiting` flag rather than silently swallowing the error.

The decision tree, confidence thresholds, regex pre-filter, and context assembly are all channel-agnostic already — no changes.

---

## Send Path & Settings UI

- **`/api/messages/send`** — replace the `platform !== "whatsapp"` guard with the provider factory. On `sender_type: "merchant"` sends, pass the `HUMAN_AGENT` tag (7-day window); never on AI sends.
- **`instagram-connection.tsx`** — mirror `whatsapp-connection.tsx` but with a single **"Connect with Instagram"** OAuth button plus connected/disconnected states. Remove the WhatsApp connection card from the settings page.
- **Dashboard prompt** — replace `whatsapp-prompt.tsx` with an equivalent "Connect Instagram" banner shown when `instagram_connected = false`.

---

## Environment Variables

```
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=     # single app-level token you choose
INSTAGRAM_REDIRECT_URI=             # {NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback
```

WhatsApp env/credentials are no longer required for new merchants.

---

## Manual Setup Checklist (Meta Console)

- [ ] Create/configure the Mo'een Meta app; add the **Instagram** product with **Instagram Login**.
- [ ] Set the OAuth **redirect URI** to `{NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`.
- [ ] Set the **webhook callback URL** to `{NEXT_PUBLIC_APP_URL}/api/webhooks/instagram` and the verify token to `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
- [ ] Subscribe to the **`messages`** webhook field.
- [ ] Run `011_instagram.sql` in Supabase SQL Editor.
- [ ] Add the four `INSTAGRAM_*` env vars to `.env.local` / Vercel.
- [ ] Add up to **25 Instagram test users** for pre-review testing.

### App Review (the calendar long-pole)

Going live with **real** merchants requires `instagram_business_manage_messages` approved via **Meta App Review** (typically **2–6 weeks**; needs a screencast demo + privacy policy). Everything can be built and tested against ≤25 test users without review. **Submit early** so review runs in parallel with the build.

---

## Phase 7 — Task Breakdown

**Slice 1 — Provider-agnostic core (no OAuth, safe to land first)** ✅
- [x] Migration `011_instagram.sql`
- [x] Generalize `PipelineInput` (`platform` + `credentials`) + `getProvider()` factory (`src/lib/messaging/index.ts`)
- [x] De-WhatsApp `process.ts` `sendAIMessage()` (routes via factory)
- [x] `InstagramProvider` (`sendMessage`, `receiveWebhook`, `getConversationHistory`, `resolveProfile`)
- [x] Window-expiry → `customer_waiting` flag handling (`isWindowExpiredError`)

**Slice 2 — Ingress/egress** ✅
- [x] `/api/webhooks/instagram` (GET verify + POST, merchant resolution by IG account ID)
- [x] `/api/messages/send` provider switch + `HUMAN_AGENT` tag for merchant sends

**Slice 3 — Onboarding** ✅
- [x] `/api/instagram/connect` (OAuth start + DELETE disconnect)
- [x] `/api/auth/instagram/callback` (token exchange, long-lived token, webhook subscribe, save settings)
- [x] Token-refresh mechanism (`/api/cron/instagram-refresh`, guarded by `CRON_SECRET`)
- [x] `instagram-connection.tsx` + settings page wiring
- [x] Replace dashboard WhatsApp prompt with Instagram prompt

**Slice 4 — Cutover & docs** ✅
- [x] Retire WhatsApp from active surface (webhook route, connect route, settings card, dashboard prompt, validation) — provider seam (`whatsapp.ts`, factory case, `whatsapp_*` columns) kept dormant
- [x] Update `CLAUDE.md` + this doc
- [x] Verify `npm run typecheck && npm run build`

**Post-build (merchant/ops setup, not code):**
- [ ] Run `011_instagram.sql` in Supabase
- [ ] Set `INSTAGRAM_*` + `CRON_SECRET` env vars
- [ ] Configure the Meta app (Instagram Login, redirect URI, webhook URL + verify token, subscribe `messages`)
- [ ] Business Verification + App Review for `instagram_business_manage_messages`
- [ ] Schedule the token-refresh cron (Vercel Cron / n8n → `GET /api/cron/instagram-refresh`)

---

## What Happens to WhatsApp Code

- **Kept:** the `MessagingProvider` interface, all `whatsapp_*` DB columns (dormant), git history of `whatsapp.ts` and the WA webhook.
- **Retired from active surface:** WA webhook route, WA connection settings card, WA branch in the send path, `WhatsAppProvider` imports.
- **Reversible:** because the provider seam is preserved, re-adding WhatsApp later (as the transactional/support layer) is cheap.

---

## Open Risks

| Risk | Mitigation |
|------|------------|
| App Review delay/rejection | Submit early; clean screencast + privacy policy; request only `instagram_business_manage_messages` |
| Token expiry (60 days) breaks a merchant silently | Scheduled refresh + a flag/alert when refresh fails |
| 24h window rejects AI replies | Detect and flag as `customer_waiting` instead of failing |
| Meta renames scopes / bumps API version | Verify endpoints against live docs at build time; don't hardcode from memory |
| Losing WhatsApp's transactional reach | Accepted trade-off for MVP; re-addable via the preserved provider seam |
