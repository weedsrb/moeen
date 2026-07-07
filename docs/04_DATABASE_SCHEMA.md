# Mo'een — Database Schema

> All tables use Supabase (PostgreSQL). Every table with merchant data includes `merchant_id` and is protected by Row Level Security.

---

## Schema Diagram

```
merchants ─────────┐
  │                 │
  ├── products      │
  │     │           │
  │     └── order_items
  │           │
  ├── orders ─┘
  │     │
  ├── customers ────┤
  │                 │
  ├── conversations │
  │     │           │
  │     └── messages│
  │                 │
  ├── flags         │
  │                 │
  └── merchant_settings
```

---

## Tables

### merchants

The core tenant table. One row per business using Mo'een.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | Merchant ID |
| `user_id` | uuid | FK → auth.users, UNIQUE, NOT NULL | Supabase Auth user ID |
| `business_name` | text | NOT NULL | Business display name |
| `business_type` | text | NULL | food, clothing, handmade, home, other |
| `city` | text | NULL | Business location |
| `phone` | text | NULL | Business phone number |
| `logo_url` | text | NULL | Supabase Storage URL for business logo |
| `onboarding_completed` | boolean | DEFAULT false | Has merchant finished onboarding? |
| `plan` | text | DEFAULT 'free' | Current plan (free for MVP, future: starter, pro) |
| `monthly_order_count` | integer | DEFAULT 0 | Orders this billing cycle (for future plan limits) |
| `created_at` | timestamptz | DEFAULT now() | Account creation date |
| `updated_at` | timestamptz | DEFAULT now() | Last update |

**RLS Policy:** `user_id = auth.uid()`

---

### merchant_settings

Per-merchant configuration. Separate from merchants table to avoid bloat on the core tenant row.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, UNIQUE, NOT NULL | |
| `telegram_bot_token` | text | NULL | Encrypted Telegram Bot token |
| `telegram_connected` | boolean | DEFAULT false | Is Telegram bot active? |
| `whatsapp_connected` | boolean | DEFAULT false | Phase 2 |
| `ai_confidence_threshold` | decimal | DEFAULT 0.70, CHECK 0.30–0.95 (migration 014) | Legacy/vestigial: no longer gates order creation (see `07_AI_PIPELINE.md` — the conversational agent gates on deterministic finalizability + explicit customer confirmation instead). Still recorded and passed to Gemini. |
| `ai_auto_clarify` | boolean | DEFAULT true | Legacy flag from the one-shot design; the conversational agent always asks for missing details regardless |
| `ai_handoff_message` | text | DEFAULT 'A team member will assist you shortly.' | Sent only on genuine escalation (`needs_human`), not on low confidence |
| `ai_status` | text | DEFAULT 'active' (migration 018) | Circuit breaker state: `active` \| `paused`. Trips after 3 `ai_unavailable` failures in 5 min |
| `ai_paused_at` | timestamptz | NULL (migration 018) | When the breaker last tripped; a 10-min cooldown elapses before one half-open probe is allowed |
| `low_stock_threshold` | integer | DEFAULT 5 | Default low stock alert level |
| `quiet_hours_start` | time | NULL | Don't notify after this time |
| `quiet_hours_end` | time | NULL | Resume notifications after this time |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

> Migration 006 also adds a persona/knowledge layer not fully re-listed here for
> brevity: `ai_persona_name`, `ai_tone`, `ai_greeting`, `ai_business_context`,
> `ai_custom_instructions`, `ai_response_language`, `ai_auto_acknowledge`,
> `ai_acknowledge_template`, plus the separate `merchant_faq` table (below).
> Migration 011 adds the `instagram_*` connection columns (see
> `09_INSTAGRAM.md`).

---

### customers

People who message the merchant. One row per unique customer per merchant.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `platform` | text | NOT NULL | 'telegram' or 'whatsapp' |
| `platform_user_id` | text | NOT NULL | Telegram user ID or WhatsApp phone |
| `name` | text | NULL | Customer display name (from platform) |
| `phone` | text | NULL | Phone number if available |
| `delivery_address` | text | NULL | Last known address (AI-extracted) |
| `total_orders` | integer | DEFAULT 0 | Lifetime order count |
| `notes` | text | NULL | Merchant's notes about this customer |
| `created_at` | timestamptz | DEFAULT now() | First contact date |
| `updated_at` | timestamptz | DEFAULT now() | |

**Unique constraint:** `(merchant_id, platform, platform_user_id)`
**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

---

### conversations

A conversation thread between a merchant and a customer. One conversation per customer per platform.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `customer_id` | uuid | FK → customers, NOT NULL | |
| `platform` | text | NOT NULL | 'telegram' or 'whatsapp' |
| `platform_chat_id` | text | NOT NULL | Telegram chat ID or WA conversation ID |
| `last_message_at` | timestamptz | NULL | Timestamp of most recent message |
| `last_message_preview` | text | NULL | Truncated preview of last message |
| `unread_count` | integer | DEFAULT 0 | Messages not yet seen by merchant |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

---

### messages

Individual messages within a conversation. Both customer and merchant/system messages.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `conversation_id` | uuid | FK → conversations, NOT NULL | |
| `platform_message_id` | text | NULL | Original message ID from platform |
| `direction` | text | NOT NULL | 'inbound' (customer) or 'outbound' (merchant/system) |
| `sender_type` | text | NOT NULL | 'customer', 'merchant', 'ai', 'system' |
| `content` | text | NOT NULL | Message text content |
| `message_type` | text | DEFAULT 'text' | 'text', 'image', 'voice', 'document' |
| `media_url` | text | NULL | URL if message contains media |
| `has_order_signal` | boolean | DEFAULT false | Did RegEx pre-filter detect order intent? |
| `ai_processed` | boolean | DEFAULT false | Has Gemini processed this message? |
| `ai_result` | jsonb | NULL | Raw Gemini response JSON |
| `created_at` | timestamptz | DEFAULT now() | Message timestamp |

**Index:** `(conversation_id, created_at)` for efficient chat history queries
**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

---

### products

The merchant's product catalog.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `name` | text | NOT NULL | Product name |
| `alternative_names` | text[] | DEFAULT '{}' | Alternative names for AI matching |
| `description` | text | NULL | Product description |
| `price` | decimal | NOT NULL | Unit price |
| `currency` | text | DEFAULT 'ILS' | Currency code |
| `image_url` | text | NULL | Supabase Storage URL |
| `quantity_total` | integer | NOT NULL DEFAULT 0 | Total inventory count |
| `quantity_reserved` | integer | DEFAULT 0 | Reserved by pending orders |
| `low_stock_threshold` | integer | NULL | Override merchant default |
| `variants` | jsonb | NULL | e.g. [{"name": "size", "options": ["S", "M", "L"]}] |
| `is_active` | boolean | DEFAULT true | Is product available for ordering? |
| `instagram_post_id` | text | NULL | If imported from Instagram |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**Computed:** `quantity_available = quantity_total - quantity_reserved` (can be a generated column or computed in queries)
**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

---

### orders

The core order table. One order per customer interaction that contains order intent.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `customer_id` | uuid | FK → customers, NOT NULL | |
| `conversation_id` | uuid | FK → conversations, NOT NULL | |
| `order_number` | text | UNIQUE, NOT NULL | Human-readable: MOE-XXXXX |
| `status` | text | NOT NULL DEFAULT 'incoming', CHECK (migration 015, extended 019) | `ai_proposal`, `collecting`, `incoming`, `pending`, `confirmed`, `out_for_delivery`, `delivered`, `cancelled` |
| `delivery_address` | text | NULL | Delivery address for this order |
| `subtotal` | decimal | DEFAULT 0 | Sum of line items |
| `total` | decimal | DEFAULT 0 | Final total (subtotal + any fees) |
| `currency` | text | DEFAULT 'ILS' | |
| `notes` | text | NULL | Merchant notes on this order |
| `ai_confidence` | decimal | NULL | Overall AI confidence score (0-1) — informational; no longer gates order creation |
| `ai_extracted` | boolean | DEFAULT false | Was this order created by AI? |
| `source_message_id` | uuid | FK → messages, NULL | The message that triggered this order |
| `ai_collection_state` | jsonb | NULL (migration 019) | AI's in-progress gathering metadata while `status = 'collecting'`: missing-field snapshot, `awaiting_confirmation` flag, last readback shown to the customer. NULL once the order graduates out of `collecting` |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |
| `confirmed_at` | timestamptz | NULL | When merchant confirmed |
| `dispatched_at` | timestamptz | NULL | When marked out for delivery |
| `delivered_at` | timestamptz | NULL | When marked delivered |

**Index:** `(merchant_id, status)` for filtered queries
**Index:** `(merchant_id, created_at)` for date range queries
**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

> `ai_proposal` and `collecting` are **pre-order staging states**: neither
> reserves stock, deducts inventory, nor counts toward `monthly_order_count`
> or the dashboard's daily order counts until it graduates into a real order
> (`incoming` or later). `collecting` is the AI's active multi-turn gathering
> draft (current pipeline behavior); `ai_proposal` was its below-threshold
> one-shot predecessor and is now dormant (no longer created by the AI, but
> the status/UI/triggers remain for historical rows — see `07_AI_PIPELINE.md`).

---

### order_items

Line items within an order. One order can have multiple items.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `order_id` | uuid | FK → orders, NOT NULL | |
| `product_id` | uuid | FK → products, NULL | NULL if product not matched |
| `product_name` | text | NOT NULL | Snapshot of product name at time of order |
| `variant` | text | NULL | Size, color, etc. |
| `quantity` | integer | NOT NULL DEFAULT 1 | |
| `unit_price` | decimal | NOT NULL | Price at time of order |
| `subtotal` | decimal | NOT NULL | quantity × unit_price |
| `ai_confidence` | decimal | NULL | Confidence of this specific extraction |
| `ai_matched` | boolean | DEFAULT false | Did AI match this to a catalog product? |

**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

---

### order_timeline

Audit log of all status changes for an order.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `order_id` | uuid | FK → orders, NOT NULL | |
| `from_status` | text | NULL | Previous status (NULL for creation) |
| `to_status` | text | NOT NULL | New status |
| `changed_by` | text | NOT NULL | 'merchant', 'ai', 'system' |
| `note` | text | NULL | Optional context for the change |
| `created_at` | timestamptz | DEFAULT now() | When the change happened |

**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

---

### flags

Escalation items that need merchant attention.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `order_id` | uuid | FK → orders, NULL | Related order (if applicable) |
| `conversation_id` | uuid | FK → conversations, NULL | Related conversation (if applicable) |
| `message_id` | uuid | FK → messages, NULL | Specific message that triggered flag |
| `priority` | text | NOT NULL | 'critical', 'medium', 'low' |
| `category` | text | NOT NULL | See categories below |
| `title` | text | NOT NULL | Short description |
| `description` | text | NULL | AI-generated context summary |
| `recommended_action` | text | NULL | What should the merchant do? |
| `is_resolved` | boolean | DEFAULT false | Has this been handled? |
| `resolved_at` | timestamptz | NULL | When resolved |
| `created_at` | timestamptz | DEFAULT now() | |

**Flag categories:** `out_of_stock`, `customer_waiting`, `ai_low_confidence`, `human_requested`, `unusual_volume`, `ai_unavailable`, `stale_order`

**Index:** `(merchant_id, is_resolved, priority)` for active flags queries
**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

---

### merchant_faq

Merchant-authored knowledge base injected into the Gemini prompt so the AI can
answer product/policy questions accurately. Added in migration 006.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `question` | text | NOT NULL, max 300 chars | |
| `answer` | text | NOT NULL, max 1000 chars | |
| `display_order` | integer | DEFAULT 0 | Order shown in Settings and injected into the prompt |
| `created_at` | timestamptz | DEFAULT now() | |

**Row cap:** capped at `MAX_FAQ_ENTRIES = 50` per merchant at the API layer
(`src/lib/validations/ai-settings.ts`), and the total injected text is further
budgeted to ~4000 characters at prompt-assembly time — both guard against
unbounded prompt bloat.
**RLS Policy:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`

---

### ai_decisions

Immutable audit trail — one row per Gemini call, written by the AI pipeline
(service role). Added in migration 016, extended in migration 019. Lets the
team answer "why was this order auto-confirmed vs. flagged?" after the fact,
and lets prompt/model changes be compared via `prompt_version`/`model_version`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `merchant_id` | uuid | FK → merchants, NOT NULL | |
| `conversation_id` | uuid | FK → conversations, NULL | |
| `message_id` | uuid | FK → messages, NULL | The triggering message |
| `order_id` | uuid | FK → orders, ON DELETE SET NULL | The order affected, if any |
| `model_version` | text | NOT NULL | From `AI_CONFIG.model` |
| `prompt_version` | text | NOT NULL | From `AI_CONFIG.promptVersion` (currently `"v3"`) |
| `input_hash` | text | NOT NULL | sha256 of the burst-coalesced content that was scored |
| `gemini_confidence` | decimal | NULL | Raw model score; NULL when Gemini failed or the breaker fast-failed |
| `effective_confidence` | decimal | NULL | Equals `gemini_confidence` today; reserved for a future deterministic re-scoring layer |
| `validation_diagnostics` | jsonb | NULL | `{invalidProductIds, priceCorrections, outOfStockItems, invalidVariants}` for order cases |
| `decision_case` | text | NOT NULL, CHECK | See `07_AI_PIPELINE.md`'s decision_case table for the currently-emitted values plus the historical (no-longer-emitted) ones kept for backward compatibility |
| `created_at` | timestamptz | DEFAULT now() | |

**Index:** `(merchant_id, created_at DESC)` for audit browsing
**Index:** `(message_id)` for reverse lookup from a message to its decision(s)
**RLS Policy:** SELECT only — `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`. No INSERT/UPDATE/DELETE policies; writes come from the service role, making this an immutable trail from the merchant's perspective.

---

## Row Level Security (RLS) Pattern

Every table follows the same pattern:

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Select policy: merchant can only see their own data
CREATE POLICY "Merchants can view own data"
  ON table_name FOR SELECT
  USING (merchant_id IN (
    SELECT id FROM merchants WHERE user_id = auth.uid()
  ));

-- Insert policy: merchant can only insert their own data
CREATE POLICY "Merchants can insert own data"
  ON table_name FOR INSERT
  WITH CHECK (merchant_id IN (
    SELECT id FROM merchants WHERE user_id = auth.uid()
  ));

-- Update policy: merchant can only update their own data
CREATE POLICY "Merchants can update own data"
  ON table_name FOR UPDATE
  USING (merchant_id IN (
    SELECT id FROM merchants WHERE user_id = auth.uid()
  ));

-- Delete policy: merchant can only delete their own data
CREATE POLICY "Merchants can delete own data"
  ON table_name FOR DELETE
  USING (merchant_id IN (
    SELECT id FROM merchants WHERE user_id = auth.uid()
  ));
```

**Service role bypass:** n8n and API routes that need cross-merchant access (e.g., webhook processing before auth) use the Supabase service role key, which bypasses RLS. This key is NEVER exposed to the client.

---

## Database Functions

### generate_order_number()
Generates human-readable order numbers: `MOE-00001`, `MOE-00002`, etc. Per-merchant sequential.

### update_inventory_on_status_change()
Trigger function: when order status changes, automatically adjusts inventory.
- `→ pending`: reserve inventory (quantity_reserved += item quantities)
- `→ confirmed`: deduct from total (quantity_total -= item quantities, quantity_reserved -= item quantities)
- `→ cancelled`: release reservation (quantity_reserved -= item quantities)

### increment_monthly_order_count()
Trigger function: when order is created, increment merchant's monthly_order_count. Reset on billing cycle (cron job).

---

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| messages | `(conversation_id, created_at)` | Chat history pagination |
| orders | `(merchant_id, status)` | Order board filtering |
| orders | `(merchant_id, created_at)` | Date range queries |
| flags | `(merchant_id, is_resolved, priority)` | Active flags dashboard |
| customers | `(merchant_id, platform, platform_user_id)` UNIQUE | Prevent duplicate customers |
| products | `(merchant_id, is_active)` | Active catalog queries |
