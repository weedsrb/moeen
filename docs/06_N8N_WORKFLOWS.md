# Mo'een — n8n Workflows Specification

> n8n is Mo'een's rules engine. It handles everything that doesn't need AI — and orchestrates the things that do.

> **Status (2026) — read first.** None of these workflows are built yet: n8n
> automation is **Phase 6 (not started)**. The channel is now **Instagram**, not
> Telegram — read every "Telegram" in the diagrams below as the provider-agnostic
> messaging abstraction (Instagram is the primary channel). Most importantly,
> **Workflow 1 (the incoming-message handler) was never built as an n8n flow** —
> that pipeline runs **in-process inside Next.js** via an `after()` callback
> (`processInboundMessage`, `src/lib/ai/process.ts`); `07_AI_PIPELINE.md` is
> authoritative. Workflow 1 below is retained only as an **aspirational /
> optional external-orchestration design**, not current reality.

---

## Workflow Overview

| # | Workflow | Trigger | AI Required | Status |
|---|---------|---------|-------------|--------|
| 1 | Incoming Message Handler | Webhook (Instagram) | Yes (conditional) | **Not an n8n flow — runs in-process in Next.js (see `07_AI_PIPELINE.md`)** |
| 2 | Order Status Notifications | Supabase webhook | No | Phase 6 — not built |
| 3 | Customer Wait Time Monitor | Cron (every 5 min) | No | Phase 6 — not built |
| 4 | Low Stock Alert | Supabase webhook | No | Phase 6 — not built |
| 5 | Stale Order Escalation | Cron (every 30 min) | No | Phase 6 — not built |
| 6 | Daily Summary | Cron (end of day) | Yes | Phase 2/6 — not built |

---

## Workflow 1: Incoming Message Handler

> ⚠️ **NOT THE CURRENT IMPLEMENTATION.** This n8n flow was never built. The live
> incoming-message pipeline runs **in-process inside Next.js** —
> `processInboundMessage` (`src/lib/ai/process.ts`), scheduled on an `after()`
> callback from `/api/webhooks/instagram`. The real pipeline also does things
> this sketch predates: an **8s burst debounce** (last-message-wins), a
> **deterministic validation** pass over Gemini's output, an **`ai_proposal`**
> draft state for below-threshold orders, an **`ai_decisions`** audit row per
> Gemini call, and content-window order dedup. `07_AI_PIPELINE.md` is
> authoritative. The section below is retained only as an **optional /
> aspirational** design for orchestrating the same steps externally in n8n.

**This is Mo'een's heartbeat.** Every customer message flows through this pipeline.

**Trigger (actual):** `/api/webhooks/instagram` → Next.js `after()` → `processInboundMessage`
**Trigger (aspirational n8n version):** Instagram Messaging webhook → n8n webhook node

**Flow (aspirational sketch — see `07` for the real flow):**

```
Instagram Webhook (aspirational; actual = Next.js after())
    │
    ▼
Parse Message
    │ Extract: chat_id, user_id, user_name, text, message_type, timestamp
    │
    ▼
Find or Create Customer
    │ Query Supabase: customers WHERE platform='instagram' AND platform_user_id=chat_id
    │ If not found → INSERT new customer
    │
    ▼
Find or Create Conversation
    │ Query Supabase: conversations WHERE platform_chat_id=chat_id AND merchant_id=X
    │ If not found → INSERT new conversation
    │ Update last_message_at, increment unread_count
    │
    ▼
Save Message
    │ INSERT into messages table
    │ Set direction='inbound', sender_type='customer'
    │
    ▼
RegEx Pre-Filter
    │ Run pattern matching against message text
    │ Patterns (Arabic + English + Arabizi):
    │   - "بدي", "اريد", "عايز" (I want)
    │   - "اطلب", "طلب" (order)
    │   - Number + product-like word
    │   - "كم سعر", "كم حق" (how much)
    │   - "order", "want", "need", "buy"
    │   - "2 knafeh", "3 pieces" (number + noun)
    │   - Delivery keywords: "توصيل", "deliver", "عنوان"
    │
    ├── No order signal detected
    │   └── STOP. Message is saved. No AI call. Dashboard shows it in conversation.
    │
    └── Order signal detected
        │ Update message: has_order_signal = true
        │
        ▼
    Build Gemini Context
        │ Fetch: last 6 messages from this conversation
        │ Fetch: merchant's product catalog (compressed format)
        │ Fetch: merchant's AI settings (confidence threshold, handoff message)
        │
        ▼
    Call Gemini 2.5 Flash
        │ (See AI_PIPELINE.md for prompt template and response format)
        │
        ├── Gemini succeeds
        │   │ Update message: ai_processed = true, ai_result = response JSON
        │   │
        │   ▼
        │   Process Gemini Response
        │   │
        │   ├── intent = "order" AND confidence >= threshold
        │   │   │
        │   │   ▼
        │   │   Create Order
        │   │   │ INSERT order (status: 'incoming', ai_extracted: true, ai_confidence: X)
        │   │   │ INSERT order_items (matched products, quantities, prices)
        │   │   │ INSERT order_timeline entry
        │   │   └── Done. Dashboard updates via Supabase Realtime.
        │   │
        │   ├── intent = "order" AND confidence < threshold   (actual pipeline = Case D)
        │   │   │
        │   │   ▼
        │   │   Create AI Proposal + Flag + Handoff
        │   │   │ INSERT order (status: 'ai_proposal' — NOT a live order)
        │   │   │ INSERT flag (priority: 'medium', category: 'ai_low_confidence')
        │   │   │ Send handoff message to customer
        │   │   └── Merchant confirms (-> incoming) or rejects (-> cancelled).
        │   │
        │   ├── intent = "order" AND missing_fields present AND confidence >= threshold
        │   │   │
        │   │   ▼
        │   │   Send Clarifying Question
        │   │   │ Gemini provides a natural clarifying question
        │   │   │ Send via the channel provider — Instagram (outbound message, sender_type: 'ai')
        │   │   │ Save outbound message in messages table
        │   │   └── Wait for customer reply (next webhook trigger restarts flow)
        │   │
        │   ├── intent = "order" AND missing_fields present AND confidence < threshold
        │   │   │
        │   │   ▼
        │   │   Flag for Human
        │   │   │ INSERT flag (priority: 'medium', category: 'ai_low_confidence')
        │   │   │ Send handoff message to customer via the channel provider (Instagram)
        │   │   │ "A team member will assist you shortly."
        │   │   └── Merchant handles manually.
        │   │
        │   ├── intent = "question" (customer asking about price, availability, etc.)
        │   │   │
        │   │   ▼
        │   │   Answer or Flag   (actual pipeline)
        │   │   │ If Gemini returned an "answer" → send it (sender_type: 'ai') — question_answered
        │   │   │ Else INSERT flag (priority: 'low', category: 'customer_waiting') — question_flagged
        │   │   └── No order created.
        │   │
        │   └── intent = "other" (greeting, thanks, general chat)
        │       └── No action. Message is saved in conversation. No flag, no order.
        │
        └── Gemini fails (timeout, error, rate limit)
            │
            ▼
            Retry once (5 second delay)
            │
            ├── Retry succeeds → continue normal flow above
            │
            └── Retry fails
                │ INSERT flag (priority: 'medium', category: 'ai_unavailable')
                │ Flag title: "AI processing unavailable — manual review needed"
                │ Flag links to the specific message
                │
                │ If 3+ failures in last 5 minutes:   (PLANNED — see notes below)
                │   Update merchant_settings: ai_status = 'paused'
                │   (Frontend shows banner: "AI processing is temporarily paused")
                │
                └── When Gemini recovers (next successful call):
                    Update merchant_settings: ai_status = 'active'
```

**Important notes:**
- The RegEx pre-filter is intentionally generous — it's better to send a non-order to Gemini (wasted API call) than to miss a real order
- Clarifying questions are sent automatically only if `ai_auto_clarify` is enabled in merchant settings
- The merchant can disable auto-clarify, in which case all uncertain messages become flags
- **The actual pipeline (`process.ts`) differs from this sketch** and is authoritative (`07_AI_PIPELINE.md`): it debounces bursts (8s, last-message-wins), validates Gemini's output deterministically before any order is written, parks below-threshold orders as `ai_proposal` drafts (not live orders), dedups orders per source message, and writes one `ai_decisions` audit row per Gemini call.
- **The `ai_status` circuit breaker is built** (migration 018 + `process.ts`): 3 `ai_unavailable` failures in 5 min trips it, fast-failing order signals for a 10-min cooldown before a half-open probe; any Gemini success resets it. Only the merchant-facing "AI paused" banner UI remains planned.

---

## Workflow 2: Order Status Notifications

**Trigger:** Supabase webhook on `orders` table when `status` column changes.

**Flow:**

```
Order Status Changed
    │
    ▼
Determine New Status
    │
    ├── status = 'confirmed'
    │   │ Template: "Your order {order_number} has been confirmed! We're preparing it now."
    │   │ Arabic: "تم تأكيد طلبك {order_number}! جاري التحضير."
    │   └── Send via the channel provider (Instagram) to customer
    │
    ├── status = 'out_for_delivery'
    │   │ Template: "Your order {order_number} is on its way!"
    │   │ Arabic: "طلبك {order_number} في الطريق إليك!"
    │   └── Send via the channel provider (Instagram) to customer
    │
    ├── status = 'delivered'
    │   │ Template: "Your order {order_number} has been delivered. Thank you!"
    │   │ Arabic: "تم توصيل طلبك {order_number}. شكراً لك!"
    │   │ Optional: "How was your experience?" feedback prompt
    │   └── Send via the channel provider (Instagram) to customer
    │
    └── status = 'cancelled'
        │ Template: "Your order {order_number} has been cancelled. Please contact us if you have questions."
        └── Send via the channel provider (Instagram) to customer
```

**Notes:**
- Messages sent via the provider-agnostic messaging abstraction (Instagram is the primary channel)
- Each outbound message saved in messages table (sender_type: 'system')
- Respect merchant's quiet hours — if in quiet hours, queue the notification
- Language detection: if conversation history is primarily Arabic, send Arabic template

---

## Workflow 3: Customer Wait Time Monitor

**Trigger:** Cron job, every 5 minutes.

**Flow:**

```
Every 5 Minutes
    │
    ▼
Query: Unresponded Inbound Messages
    │ SELECT conversations WHERE:
    │   - last message is inbound (from customer)
    │   - last message is older than merchant's response time threshold (default: 60 min)
    │   - no flag already exists for this conversation with category 'customer_waiting'
    │   - conversation is not already resolved
    │
    ▼
For Each Match:
    │
    ├── Waiting > 2 hours
    │   └── INSERT flag (priority: 'critical', category: 'customer_waiting')
    │       Description: "Customer {name} has been waiting {time} for a response."
    │       Recommended action: "Reply to customer immediately."
    │
    ├── Waiting > 60 minutes (default threshold)
    │   └── INSERT flag (priority: 'medium', category: 'customer_waiting')
    │       Description: "Customer {name} has been waiting {time}."
    │       Recommended action: "Reply to customer soon."
    │
    └── Waiting > 30 minutes
        └── No flag yet, but upgrade existing medium flag to critical if it exists
```

---

## Workflow 4: Low Stock Alert

**Trigger:** Supabase webhook on `products` table when `quantity_total` or `quantity_reserved` changes.

**Flow:**

```
Product Inventory Changed
    │
    ▼
Calculate Available Quantity
    │ available = quantity_total - quantity_reserved
    │
    ├── available <= 0 (OUT OF STOCK)
    │   │
    │   ▼
    │   Check: Are there any pending/incoming orders for this product?
    │   ├── Yes → INSERT flag (priority: 'critical', category: 'out_of_stock')
    │   │         Description: "Product {name} is out of stock with {count} pending orders."
    │   │         Recommended: "Update customers or cancel affected orders."
    │   │
    │   └── No → INSERT flag (priority: 'medium', category: 'out_of_stock')
    │             Description: "Product {name} is out of stock."
    │             Recommended: "Restock or mark as inactive."
    │
    ├── available <= low_stock_threshold
    │   └── INSERT flag (priority: 'low', category: 'low_stock')
    │       Description: "Product {name} is running low ({available} remaining)."
    │       Recommended: "Consider restocking soon."
    │
    └── available > low_stock_threshold
        └── Auto-resolve any existing low_stock flag for this product
```

---

## Workflow 5: Stale Order Escalation

**Trigger:** Cron job, every 30 minutes.

**Flow:**

```
Every 30 Minutes
    │
    ▼
Query: Stale Orders
    │
    ├── Orders with status 'incoming' for > 2 hours
    │   └── INSERT or UPGRADE flag (priority: 'critical', category: 'stale_order')
    │       Description: "Order {order_number} has been in Incoming for {time}."
    │       Recommended: "Review and move to Pending or reject."
    │
    ├── Orders with status 'incoming' for > 30 minutes
    │   └── INSERT flag (priority: 'medium', category: 'stale_order')
    │       Description: "Order {order_number} needs review."
    │
    ├── Orders with status 'pending' for > 24 hours
    │   └── INSERT flag (priority: 'critical', category: 'stale_order')
    │       Description: "Order {order_number} has been Pending for over a day."
    │       Recommended: "Confirm or contact customer."
    │
    └── Orders with status 'confirmed' for > 48 hours
        └── INSERT flag (priority: 'medium', category: 'stale_order')
            Description: "Order {order_number} confirmed but not dispatched in 2 days."
            Recommended: "Mark as dispatched or check with delivery."
```

---

## Workflow 6: Daily Summary (Phase 2)

**Trigger:** Cron job, daily at merchant's configured end-of-day time (default: 9 PM).

**Flow:**

```
End of Day
    │
    ▼
Aggregate Today's Data
    │ - Orders created, confirmed, delivered, cancelled
    │ - Revenue from delivered orders
    │ - Average response time
    │ - Flags created and resolved
    │ - Top selling products
    │ - Inventory alerts
    │
    ▼
Send to Gemini
    │ Prompt: "Generate a brief, friendly daily business summary in Arabic and English."
    │ Include: aggregated data above
    │
    ▼
Send Summary via the messaging abstraction (Instagram)
    │ Direct message to the merchant
    │ Format: natural language, with key numbers highlighted
    │
    Example:
    "Today's summary for [Business Name]:
     📦 12 new orders, 8 confirmed, 5 delivered
     💰 Revenue: ₪1,240
     ⚡ Avg response time: 15 minutes
     ⚠️ 2 items running low: Knafeh (3 left), Baklava (5 left)
     Great day! 🎉"
```

---

## n8n ↔ Supabase Connection

All workflows interact with Supabase via:
- **REST API** (for reads and writes) — using Supabase URL + service role key
- **Webhooks** (for triggers) — Supabase Database Webhooks fire HTTP requests to n8n webhook URLs

**Supabase Database Webhooks to configure:**
1. `orders` table → on UPDATE (status column) → triggers Workflow 2
2. `products` table → on UPDATE (quantity_total, quantity_reserved) → triggers Workflow 4

**n8n Webhook URLs to configure:**
1. (Workflow 1 is **not** an n8n flow — inbound Instagram messages are handled in-process by Next.js at `/api/webhooks/instagram`; no n8n webhook is needed)
2. Supabase order status webhook → points to n8n Workflow 2 webhook node
3. Supabase inventory webhook → points to n8n Workflow 4 webhook node

---

## Error Handling Across All Workflows

- Every workflow has an error handler node that logs failures to a `workflow_errors` table in Supabase
- Critical workflow failures (Workflow 2) send an alert to the merchant via the messaging abstraction (Instagram)
- Non-critical failures are logged but don't alert
- All external API calls (Gemini, Instagram) have retry logic: 1 retry after 5 seconds
- If Supabase itself is unreachable, n8n queues the operation and retries every minute
