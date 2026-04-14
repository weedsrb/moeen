# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mo'een (معين — "the one who helps") is an order management SaaS platform for Palestinian/MENA small businesses. It intercepts customer messages on WhatsApp, uses AI to extract structured orders, and presents them in a merchant dashboard.

## Documentation

Read these specs before making changes (in order):

1. `docs/01_PROJECT_VISION.md` — what Mo'een is and why
2. `docs/02_FEATURES.md` — every page and feature spec
3. `docs/03_ARCHITECTURE.md` — system design and file structure
4. `docs/04_DATABASE_SCHEMA.md` — all tables and relationships
5. `docs/05_DESIGN_SYSTEM.md` — colors, typography, animations
6. `docs/06_N8N_WORKFLOWS.md` — automation workflows
7. `docs/07_AI_PIPELINE.md` — Gemini integration spec
8. `docs/08_IMPLEMENTATION_GUIDE.md` — phased build plan

## Commands

```bash
npm run dev        # Start dev server (Turbopack)
npm run build      # Production build
npm run lint       # ESLint check
npm run typecheck  # TypeScript type check (tsc --noEmit)
npm run start      # Start production server
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=   # Your deployment URL or ngrok URL for local dev
```

WhatsApp credentials (phone number ID, access token, verify token) are stored per-merchant in `merchant_settings`, not in env vars.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript strict mode |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Animations | Framer Motion (React state) + GSAP (timelines/scroll) |
| Database | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| AI | Google Gemini 2.5 Flash |
| Automation | n8n Cloud |
| Messaging | WhatsApp Cloud API (Meta Graph API v21.0) |
| Deployment | Vercel (frontend) + Supabase Cloud |

## Architecture

Three-layer system: **Next.js frontend** → **Next.js API routes** → **Supabase + n8n + Gemini**

Critical message flow: Customer sends WhatsApp message → Meta POSTs to `/api/webhooks/whatsapp/[merchantId]` → find/create customer + conversation → save message → Supabase Realtime push → Dashboard updates live → AI pipeline runs in background via `after()` callback

AI pipeline flow: RegEx pre-filter (Arabic/English/Arabizi patterns) → context assembly (last 6 messages + product catalog + merchant settings + FAQ) → Gemini 2.5 Flash (structured JSON extraction) → decision tree (auto-create order / ask clarification / flag for human)

**Key architectural rules:**
- The app NEVER calls Telegram/WhatsApp APIs directly — always through the `MessagingProvider` interface in `src/lib/messaging/`
- Gemini is called ONLY after RegEx pre-filter detects an order signal (cost control)
- All sensitive operations (inventory math, status transitions, Gemini calls, bot tokens) run server-side in `src/app/api/` routes
- Server Components for initial page loads; Client Components for realtime/animations
- Webhook routes use `createAdminClient()` (no user session) — all others use `createClient()` with RLS

**Route groups:**
- `src/app/page.tsx` — landing page (root route, no auth required)
- `src/app/(public)/` — login, signup (no auth required)
- `src/app/(app)/` — dashboard, orders, conversations, inventory, flags, settings (auth required)
- `src/app/api/` — API routes for webhooks, orders, products, messages, AI processing

**Public API paths (exempt from auth middleware):**
- `/api/auth/` — OAuth callback
- `/api/waitlist` — landing page signup
- `/api/webhooks/` — WhatsApp webhook receiver (no user session, uses verify_token for GET challenge + merchantId in path)

## Git Workflow

### Branch naming
Always create a branch before starting any feature or fix:
```bash
git checkout -b feature/phase-4-ai-pipeline
git checkout -b fix/webhook-idempotency
git checkout -b chore/update-dependencies
```

Allowed prefixes: `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `hotfix/`

### Commit format (enforced by commitlint)
```
feat(scope): description       ← new feature
fix(scope): description        ← bug fix
chore: description             ← deps, config, maintenance
docs: description              ← documentation only
refactor(scope): description   ← code cleanup
```

Rules: lowercase subject, no period at end, max 72 chars. Scope is optional.

### Automated hooks (Husky)
- **pre-commit** — lint-staged runs ESLint + `tsc --noEmit` on staged TS files
- **commit-msg** — commitlint validates conventional commit format
- **pre-push** — enforces branch naming convention

### CI (GitHub Actions)
Every PR and push to `main` runs: lint → typecheck → build. All must pass.

## Design System Rules

- **Dark mode default** — black (`#0A0A0A`) base; light theme also available. Theme managed by `ThemeProvider` in `src/components/theme-provider.tsx`, persisted to `localStorage`
- **Color = meaning** — each color maps to a specific concept:
  - Blue: incoming orders/messages, Amber: pending, Green: confirmed, Violet: in delivery, Teal: delivered
  - Red: critical flags, Amber: medium, Gray: low
  - **Violet (`#7C3AED`) is exclusively for AI-generated content** — never use it decoratively
- **Fonts:** DM Sans (Latin), Noto Naskh Arabic (Arabic text), JetBrains Mono (order IDs, prices, timestamps)
- **Framer Motion** for React state animations (page transitions 0.3s, card stagger, KPI counts)
- **GSAP** for landing page sequences (chaos→clarity hero) and scroll-triggered reveals
- Mobile-first responsive design
- Use Tailwind classes: `text-status-incoming`, `text-ai`, `text-priority-critical`, `font-mono` for data, `font-arabic` for Arabic text
- CSS logical properties for RTL support (`margin-inline-start` not `margin-left`, `ps-` not `pl-`)

## Database

Multi-tenant via shared PostgreSQL with Row Level Security (RLS). Every table has `merchant_id` — always filter by it. RLS is enforced at the database level as a security guarantee, not just app convention.

Core tables: `merchants`, `merchant_settings`, `customers`, `conversations`, `messages`, `products`, `orders`, `order_items`, `order_timeline`, `flags`, `stock_adjustments`

Core tables: `merchant_faq` (AI knowledge base Q&A pairs per merchant)

`merchant_settings` key columns: `whatsapp_phone_number_id`, `whatsapp_access_token`, `whatsapp_verify_token`, `whatsapp_business_account_id`, `whatsapp_display_phone`, `whatsapp_connected`, `ai_confidence_threshold`, `ai_auto_clarify`, `ai_handoff_message`, `ai_persona_name`, `ai_tone`, `ai_greeting`, `ai_business_context`, `ai_custom_instructions`, `ai_response_language`, `ai_auto_acknowledge`, `ai_acknowledge_template`, `low_stock_threshold`

## Key Principles

- TypeScript strict mode — no `any` types
- All data queries must filter by `merchant_id` (RLS)
- AI suggests, merchant decides — confidence thresholds determine auto-create vs. flag for human
- Messages are never lost — always saved to Supabase before any processing
- CSS logical properties for RTL support
- Webhook handlers always return 200 OK to Meta (wrap in try/catch to prevent retry storms)
- Idempotency via `platform_message_id` — check before inserting any inbound message

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Project Setup | ✅ Complete | Next.js 16, TypeScript, Tailwind v4, Supabase, Framer Motion, GSAP |
| 0.5 — Landing Page | ✅ Complete | GSAP animations, all sections, chaos→clarity hero |
| 1 — Foundation | ✅ Complete | Auth, DB schema, app shell, onboarding, page shells |
| 2 — Catalog & Inventory | ✅ Complete | Product CRUD, image upload, inventory page, stock adjustments, dashboard alerts |
| 3 — WhatsApp Integration | ✅ Complete | WhatsApp Cloud API connection, webhook receiver, real-time conversations, send/receive messages, unread badges |
| 4 — AI Pipeline | ✅ Complete | Gemini 2.5 Flash, regex pre-filter, order extraction, confidence-based decisions, AI settings UI, FAQ knowledge base |
| 5 — Order Management | ⬜ Not started | |
| 6 — Automation (n8n) | ⬜ Not started | |

## Phase 1 — What Was Built

**Auth:**
- `src/middleware.ts` — protects all `(app)` routes, redirects to `/onboarding` if merchant profile missing
- `src/lib/supabase/middleware.ts` — middleware-specific Supabase client (uses NextRequest/NextResponse cookies)
- `src/app/api/auth/callback/route.ts` — OAuth code exchange handler
- `src/app/(public)/login/page.tsx` — Google, email/password, phone OTP
- `src/app/(public)/signup/page.tsx` — same methods + email confirmation state

**Database:**
- `supabase/migrations/001_initial_schema.sql` — all 11 tables, RLS, indexes, triggers
- `src/lib/supabase/admin.ts` — service role client (server-only, bypasses RLS)

**Onboarding:**
- `src/app/(app)/onboarding/page.tsx` + `actions.ts` — creates merchant + merchant_settings rows
- `src/components/onboarding/business-basics-form.tsx` — name, type, city, phone

**App Shell:**
- `src/app/(app)/layout.tsx` — fetches merchant server-side, wraps in MerchantProvider
- `src/components/layout/sidebar.tsx` — desktop nav (240px), icon-only on tablet, hidden on mobile
- `src/components/layout/top-bar.tsx` — business name, notification bell, profile dropdown
- `src/components/layout/mobile-nav.tsx` — fixed bottom nav for mobile
- `src/components/layout/merchant-provider.tsx` — React context; use `useMerchant()` hook in client components
- `src/components/layout/page-transition.tsx` — Framer Motion wrapper (opacity + y, 0.3s)

**Pages:** All shells wrapped in `<PageTransition>`: dashboard (KPI cards), orders, inventory, flags, settings

**Waitlist:**
- `src/app/api/waitlist/route.ts` — POST endpoint, uses admin client
- `src/components/landing/footer-cta-section.tsx` — email form added

## Phase 2 — What Was Built

**Database Migrations:**
- `supabase/migrations/002_product_images_storage.sql` — Supabase Storage bucket for product images (public, 5MB, RLS)
- `supabase/migrations/003_stock_adjustments.sql` — `stock_adjustments` table for audit logging manual +/- changes

**Types & Validation:**
- `src/types/product.ts` — `Product`, `ProductVariant`, `StockAdjustment`, `StockStatus` types
- `src/lib/validations/product.ts` — Zod schemas: `createProductSchema`, `updateProductSchema`, `stockAdjustmentSchema`
- `src/lib/utils/inventory.ts` — helpers: `getStockStatus()`, `getAvailableQuantity()`, `formatPrice()`, `getStockBarPercentage()`, etc.

**API Routes:**
- `src/app/api/products/route.ts` — GET (list merchant products) + POST (create product)
- `src/app/api/products/[id]/route.ts` — GET (single), PATCH (update), DELETE (soft delete via `is_active = false`)
- `src/app/api/products/[id]/adjust/route.ts` — POST (stock adjustment with reason logging)

**Inventory Components** (`src/components/inventory/`):
- `product-form.tsx` — Sheet slide-over for add/edit with image upload to Supabase Storage, alt names tag input, variants, Zod validation
- `inventory-content.tsx` — client wrapper managing search, filter, sort, view state
- `inventory-toolbar.tsx` — search, status filter (all/in stock/low/out), sort, grid/list toggle, add button
- `product-grid.tsx` — responsive card grid with Framer Motion stagger animation
- `product-card.tsx` — product card with image, price, stock bar, status badge, quantities
- `product-table.tsx` — table view with all columns
- `stock-bar.tsx` — horizontal bar (green/amber/red) based on stock health
- `product-detail.tsx` — full detail page with edit, deactivate, stock adjustment +/-
- `stock-adjustment-dialog.tsx` — Dialog for manual stock +/- with reason and preview

**Dashboard:**
- `src/components/dashboard/inventory-alerts.tsx` — out of stock (red) + low stock (amber) alerts, clickable to product detail

**Pages:**
- `src/app/(app)/inventory/page.tsx` — server component fetching products + merchant settings, renders `InventoryContent`
- `src/app/(app)/inventory/[id]/page.tsx` — server component fetching product + adjustments, renders `ProductDetail`
- `src/app/(app)/dashboard/page.tsx` — server component with inventory alerts integration

**Key patterns established in Phase 2:**
- Product form uses client-side state + `fetch` to API routes (not server actions) for interactive image upload
- Image upload goes directly from browser to Supabase Storage, API only receives the public URL
- Client-side filtering/sorting for MVP (all products fetched at once)
- Soft delete (`is_active = false`) to preserve `order_items` references
- Stock adjustments create audit trail in `stock_adjustments` table
- Base-ui Select `onValueChange` passes `string | null` — always guard with `(v) => v && handler(v)`

## Phase 3 — What Was Built (WhatsApp Cloud API)

**Database Migrations:**
- `supabase/migrations/004_telegram_webhook.sql` — indexes on `conversations(merchant_id, last_message_at DESC)` and `messages(platform_message_id)` (originally for Telegram, indexes reused)
- `supabase/migrations/005_whatsapp_migration.sql` — drops Telegram columns, adds WhatsApp columns: `whatsapp_phone_number_id`, `whatsapp_access_token`, `whatsapp_verify_token`, `whatsapp_business_account_id`, `whatsapp_display_phone`, `whatsapp_connected` to `merchant_settings`

**Types & Validation:**
- `src/types/whatsapp.ts` — `WhatsAppWebhookPayload`, `WhatsAppMessage`, `WhatsAppMedia`, `WhatsAppContact`, `WhatsAppStatus`, `WhatsAppSendResponse`, `WhatsAppErrorResponse` types
- `src/lib/validations/whatsapp.ts` — `connectWhatsAppSchema` (phoneNumberId, accessToken, verifyToken, businessAccountId)
- `src/lib/validations/messaging.ts` — shared `sendMessageSchema` (conversationId, content) used by send API route
- `src/types/merchant.ts` — `MerchantSettings` has WhatsApp fields: `whatsapp_phone_number_id`, `whatsapp_access_token`, `whatsapp_verify_token`, `whatsapp_business_account_id`, `whatsapp_display_phone`, `whatsapp_connected`

**Messaging Layer:**
- `src/lib/messaging/interface.ts` — `MessagingProvider` interface, `ParsedMessage`, `MessageResult` types
- `src/lib/messaging/whatsapp.ts` — `WhatsAppProvider` implementing `MessagingProvider`; methods: `sendMessage()`, `sendTemplateMessage()`, `receiveWebhook()`, `getConversationHistory()`; static: `verifyCredentials()` (calls Meta Graph API to validate phone number ID + token)

**API Routes:**
- `src/app/api/whatsapp/connect/route.ts` — POST (calls `verifyCredentials()`, saves phone number ID/token/verify token/display phone to DB) + DELETE (clears all whatsapp fields)
- `src/app/api/webhooks/whatsapp/[merchantId]/route.ts` — GET (verify_token challenge for Meta webhook setup), POST (inbound message processing: idempotency check, customer upsert, conversation find/create, message insert, conversation metadata update). Always returns 200 to Meta.
- `src/app/api/messages/route.ts` — GET messages for a conversation (resets unread count)
- `src/app/api/messages/send/route.ts` — POST send merchant reply via `WhatsAppProvider` + save to DB; checks `conversation.platform === "whatsapp"` before sending

**Realtime Hooks:**
- `src/hooks/use-realtime-conversations.ts` — Supabase Realtime subscription on `conversations` table
- `src/hooks/use-realtime-messages.ts` — Supabase Realtime subscription on `messages` table
- `src/hooks/use-unread-count.ts` — fetches total unread count across all conversations, subscribes to realtime updates; used by sidebar and mobile nav for badge display

**Chat Components** (`src/components/chat/`):
- `message-bubble.tsx` — styled by sender type (customer=blue, merchant=gray, AI=violet, system=centered)
- `chat-thread.tsx` — scrollable message list with date separators, auto-scroll, realtime updates; exports `ChatSendRef` interface with `addOptimistic(content)` and `markFailed(content)` methods; renders failed messages with red tint + "Failed to send. Tap to retry" retry button
- `reply-input.tsx` — auto-growing textarea, Enter to send; uses `ChatSendRef` for optimistic sends (clears input + shows message instantly before API responds); calls `markFailed()` on API error

**Conversations Components** (`src/components/conversations/`):
- `conversation-list.tsx` — searchable list sorted by `last_message_at`, unread badge, customer initials avatar
- `conversations-content.tsx` — two-panel layout (list + chat), mobile toggle, realtime conversation updates; holds `sendRef = useRef<ChatSendRef | null>(null)` passed to both `ChatThread` and `ReplyInput`

**Settings Components:**
- `src/components/settings/whatsapp-connection.tsx` — connected/disconnected states; form for phoneNumberId/accessToken/verifyToken/businessAccountId; uses controlled `open` state for disconnect dialog (no `DialogTrigger` wrapping `Button`)

**Dashboard:**
- `src/components/dashboard/whatsapp-prompt.tsx` — dismissible green banner linking to `/settings`, shown when `whatsapp_connected = false`

**Pages:**
- `src/app/(app)/conversations/page.tsx` — server component fetching conversations with customer names; uses `flex flex-col flex-1 min-h-0` for proper card-contained scrolling
- `src/app/(app)/settings/page.tsx` — client component fetching `whatsapp_connected, whatsapp_display_phone` on mount, renders `WhatsAppConnection`
- `src/app/(app)/dashboard/page.tsx` — server component with `WhatsAppPrompt` banner

**Navigation:**
- `src/components/layout/sidebar.tsx` — Messages nav item with unread count badge via `useUnreadCount(merchantId)`
- `src/components/layout/mobile-nav.tsx` — Messages nav item with overlay badge using `-end-1` (logical property)

**Layout Fix:**
- `src/app/(app)/layout.tsx` — `<main>` uses `flex-1 flex flex-col overflow-hidden` to enable card-contained scrolling
- `src/components/layout/page-transition.tsx` — adds `flex-1 min-h-0 overflow-auto` by default (merged via `cn()`)

**Key patterns established in Phase 3:**
- Webhook URL: `{NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp/{merchantId}` — merchantId (UUID) in path
- Webhook GET: Meta sends `hub.mode=subscribe` + `hub.verify_token` + `hub.challenge` — compare against stored `whatsapp_verify_token`, return challenge
- Webhook POST: No programmatic registration — merchant configures URL + verify token manually in Meta Console
- Idempotency via `platform_message_id` — checked before inserting any message
- Always return 200 OK to Meta regardless of processing errors (prevent retry storms)
- Optimistic sends: `ChatSendRef` connects `ChatThread` and `ReplyInput` without prop drilling through parent
- Failed sends: `markFailed(content)` finds the optimistic message by content and sets `failed: true`; clicking retries
- WhatsApp test number limitation: Meta sandbox only sends to pre-registered test recipients; replies to non-test numbers fail with 400 from Meta
- `ConversationWithCustomer` type extends `Conversation` with joined `customers` data

## Phase 4 — What Was Built (AI Pipeline)

**Database Migrations:**
- `supabase/migrations/006_ai_settings.sql` — adds AI persona columns to `merchant_settings` (`ai_persona_name`, `ai_tone`, `ai_greeting`, `ai_business_context`, `ai_custom_instructions`, `ai_response_language`, `ai_auto_acknowledge`, `ai_acknowledge_template`); creates `merchant_faq` table (id, merchant_id, question, answer, display_order) with RLS

**AI Core Library** (`src/lib/ai/`):
- `types.ts` — `GeminiResponse`, `GeminiItem`, `PipelineInput`, `CompressedProduct`, `AssembledContext` types; `geminiResponseSchema` Zod schema for runtime validation of Gemini output
- `regex-filter.ts` — `shouldProcess()` pre-filter with Arabic (بدي, عايز, طلب), English (order, want, buy), and Arabizi (bidi, atlobi) patterns; bypasses greetings/thanks/emojis; always processes replies to AI messages and bare numbers
- `context.ts` — `assembleContext()` fetches last 6 messages, active products (auto-limited to ~50), merchant AI settings, business name, FAQ; `buildMerchantContext()` constructs system prompt with persona/tone/greeting/language/FAQ/custom instructions
- `gemini.ts` — `callGemini()` calls Gemini 2.5 Flash with temperature 0.1, thinking budget 1024 tokens, JSON response mode; includes JSON repair for truncated responses (unclosed strings/brackets)
- `process.ts` — `processInboundMessage()` main orchestrator: RegEx → context → Gemini (with 1 retry) → save AI result → decision tree. Decision tree: intent "other" → no action; "question" → send AI answer or flag; "order" + high confidence + complete → auto-create; + missing fields + auto-clarify → send clarification; + missing + no auto-clarify → create + flag; low confidence → create + flag + handoff message
- `order-creator.ts` — `createOrderFromAI()` atomically creates order (MO-000001 format) + order_items + timeline entry with AI confidence metadata

**API Routes:**
- `src/app/api/ai/process/route.ts` — POST manual reprocessing of a specific message (auth required, resets AI fields before re-running pipeline)
- `src/app/api/settings/ai/route.ts` — GET/PATCH merchant AI settings (threshold, auto-clarify, handoff, persona, tone, greeting, language, auto-acknowledge)
- `src/app/api/settings/ai/faq/route.ts` — GET/POST FAQ entries for merchant
- `src/app/api/settings/ai/faq/[id]/route.ts` — PATCH/DELETE individual FAQ entries with ownership verification

**Settings Components** (`src/components/settings/`):
- `ai-behavior-settings.tsx` — confidence threshold slider (30-95% with color zones: red <60%, amber 60-80%, green >80%), auto-clarify toggle, handoff message, auto-acknowledge toggle + template
- `ai-persona-settings.tsx` — assistant name, tone selector (friendly/formal/casual), greeting, response language (auto/Arabic/English), business context (1000 chars), custom instructions (1000 chars)
- `ai-faq-settings.tsx` — knowledge base manager: add/edit/delete Q&A pairs, pending entries editable, saved entries read-only

**Validation:**
- `src/lib/validations/ai-settings.ts` — `updateAISettingsSchema` (all AI settings fields), `createFAQSchema`, `updateFAQSchema`

**Webhook Integration:**
- `src/app/api/webhooks/whatsapp/[merchantId]/route.ts` — updated POST handler: auto-acknowledge (instant reply before AI), then `processInboundMessage()` runs in background via `after()` callback; only processes text messages with content

**Pages:**
- `src/app/(app)/settings/page.tsx` — server component fetching AI settings + FAQ in parallel, renders AIBehaviorSettings + AIPersonaSettings + AIFAQSettings sections
- `src/app/(app)/flags/page.tsx` — displays AI-generated flags (ai_low_confidence, ai_unavailable, customer_waiting) grouped by priority with resolution actions

**Key patterns established in Phase 4:**
- Two-stage filtering: cheap RegEx first (Arabic/English/Arabizi), expensive Gemini only when order signal detected
- Reply-to-AI detection: checks `last_outbound_sender_type` to always process customer replies to AI messages
- Auto-acknowledge fires before AI processing (instant customer response, fire-and-forget)
- `after()` callback keeps webhook response fast (returns 200 to Meta immediately, AI runs in background)
- Gemini gets full merchant context: persona, tone, greeting, language, FAQ, custom instructions, business description
- Confidence-based decision tree: 4 distinct paths for order handling
- AI messages sent via WhatsApp with `sender_type: "ai"` — rendered with violet styling in chat
- Graceful degradation: Gemini failures create `ai_unavailable` flags instead of crashing
- Atomic order creation: order + items + timeline created together with `ai_confidence` and `ai_extracted` metadata

## Testing

**No automated test suite exists.** Testing is manual. A comprehensive verification test plan covering 7 test groups (Connection, Webhook, Receiving, Sending, Realtime, UI/Layout, Dashboard) is documented in the plan file at `/Users/waleedsrb/.claude/plans/elegant-pondering-coral.md`.

To verify code quality: `npm run typecheck && npm run build`

## shadcn/ui Note

This project uses **base-ui** backed shadcn components (not Radix). Key differences:
- `DropdownMenuTrigger`, `TooltipTrigger`, `SheetTrigger`, `DialogTrigger` do NOT support `asChild` prop
- For dialogs triggered by a `<Button>`: use controlled `open` state (`const [open, setOpen] = useState(false)`) — put `onClick={() => setOpen(true)}` on the Button, pass `open={open} onOpenChange={setOpen}` to `<Dialog>`. Do NOT wrap `<Button>` inside `<DialogTrigger>` — this creates nested `<button>` elements and a React hydration error.
- Zod v4: import from `"zod/v4"` (not `"zod"`), uses `.issues` not `.errors` on `ZodError`
- Select `onValueChange` passes `string | null` — always null-guard: `(v) => v && handler(v)`

**Installed components:** button, input, label, card, separator, select, avatar, dropdown-menu, tooltip, dialog, sheet, table, badge, textarea, tabs, skeleton, switch

## Manual Setup Required After Each Phase

Always check after implementation:
1. **SQL migrations** — run new files in Supabase SQL Editor
2. **Env vars** — add new values to `.env.local`
3. **Supabase settings** — enable providers, Storage buckets, Realtime, Webhooks as needed

**Phase 3 setup checklist:**
- Run `supabase/migrations/004_telegram_webhook.sql` in Supabase SQL Editor (indexes only)
- Run `supabase/migrations/005_whatsapp_migration.sql` in Supabase SQL Editor (drops Telegram columns, adds WhatsApp columns)
- Add `NEXT_PUBLIC_APP_URL` to `.env.local` (ngrok URL for local dev, Vercel URL for prod)
- Enable Supabase Realtime for `conversations` and `messages` tables (Dashboard → Database → Replication)
- For local dev: run `ngrok http 3000` and use the ngrok URL as `NEXT_PUBLIC_APP_URL`
- In Meta Console → App → WhatsApp → Configuration: set webhook URL to `{NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp/{merchantId}` and verify token to your chosen string
- Subscribe to `messages` webhook field in Meta Console

**Phase 4 setup checklist:**
- Run `supabase/migrations/006_ai_settings.sql` in Supabase SQL Editor (AI persona columns + merchant_faq table)
- Add `GEMINI_API_KEY` to `.env.local` (Google AI Studio API key)
- AI settings are configurable per-merchant in Settings page (no env vars needed for AI behavior)
