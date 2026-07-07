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
> callback from `/api/webhooks/instagram`. The real pipeline is a
> **conversational order-taking agent**, not the single-shot extraction this
> sketch describes: an **8s burst debounce** (last-message-wins), a **cheap LLM
> intent classifier** cold-gate (RegEx kept only as a fail-open fallback), a
> **circuit breaker**, a **deterministic stage-gating validation** pass over
> Gemini's output, a **`collecting`** draft order the AI gathers details into
> across turns (promoted to `incoming` only after the customer confirms a
> readback **and** the order is deterministically finalizable), an
> **`ai_decisions`** audit row per Gemini call, and content-window order dedup.
> `07_AI_PIPELINE.md` is authoritative. The section below is retained only as
> an **optional / aspirational** design for orchestrating the same steps
> externally in n8n, and its decision tree reflects an **older, superseded**
> confidence-threshold design — see `07_AI_PIPELINE.md`'s Stage 6 for the real
> decision tree.

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
Cold-Start Gate
    │ (actual pipeline: cheap LLM intent classifier, RegEx is a fallback only)
    │ Mid-conversation signal? (open collecting draft / reply-to-AI / bare number)
    │   → ALWAYS process, skip straight to Build Gemini Context
    │ Otherwise classify: order / question / other
    │
    ├── Classified "other"
    │   └── STOP. Message is saved. No AI call. Dashboard shows it in conversation.
    │
    └── Classified "order" or "question" (or an always-process signal fired)
        │ Update message: has_order_signal = true
        │
        ▼
    Build Gemini Context
        │ Fetch: last 6 messages from this conversation
        │ Fetch: merchant's product catalog (compressed format)
        │ Fetch: merchant's AI settings (persona, tone, language, handoff message)
        │ Fetch: the open `collecting` order for this conversation, rendered
        │        as "order so far" — this is how the agent remembers the
        │        in-progress order across turns
        │
        ▼
    Call Gemini 2.5 Flash — the order-taking agent
        │ (See 07_AI_PIPELINE.md for the prompt and response schema)
        │ Returns: intent, order_stage, items[], missing_fields[],
        │          reply_to_customer, needs_human, confidence
        │
        ├── Gemini succeeds
        │   │ Update message: ai_processed = true, ai_result = response JSON
        │   │
        │   ▼
        │   Deterministic Validation (stage-gating, NOT just advisory)
        │   │ Allow-list product_ids · recompute prices/totals from catalog ·
        │   │ check stock ≤ available · check variant is offered
        │   │ Any hard problem forces order_stage back DOWN to "collecting"
        │   │
        │   ▼
        │   Resolve Stage & Act
        │   │
        │   ├── order_stage = "cancelled"
        │   │   │ Cancel the open collecting order (if any); send the reply
        │   │   └── decision_case: order_cancelled_by_customer
        │   │
        │   ├── order_stage = "collecting" / "ready_to_confirm" (not finalizable)
        │   │   │ Upsert the ONE open collecting draft for this conversation
        │   │   │ (create if none exists yet, else overwrite items/address)
        │   │   │ Flag invalid products / stock shortfalls / invalid variants
        │   │   │ Send exactly one reply: next question, availability notice,
        │   │   │ or the readback ("To confirm: … shall I place it?")
        │   │   └── decision_case: order_collecting / order_ready_to_confirm
        │   │
        │   ├── order_stage = "confirmed" AND deterministically finalizable
        │   │   │ FINALIZE GATE PASSES — promote collecting -> incoming
        │   │   │ INSERT order_timeline entry (changed_by: 'ai')
        │   │   │ Send acknowledgement to the customer
        │   │   └── decision_case: order_confirmed. Dashboard updates via Realtime.
        │   │
        │   ├── intent = "question"
        │   │   │ If Gemini returned reply_to_customer → send it (sender_type: 'ai')
        │   │   │ Else INSERT flag (priority: 'low', category: 'customer_waiting')
        │   │   └── decision_case: question_answered / question_flagged. No order created.
        │   │
        │   ├── intent = "other" (greeting, thanks, general chat)
        │   │   └── No action. decision_case: intent_other.
        │   │
        │   └── needs_human = true  (genuine escalation ONLY — not low confidence)
        │       │ Send handoff message: "A team member will assist you shortly."
        │       │ INSERT flag (priority: 'medium'/'critical', category: 'human_requested')
        │       └── Merchant handles manually.
        │
        └── Gemini fails (timeout, error, rate limit)
            │
            ▼
            Retry once (immediate, no delay)
            │
            ├── Retry succeeds → continue normal flow above
            │
            └── Retry fails
                │ INSERT flag (priority: 'critical', category: 'ai_unavailable')
                │ Flag links to the specific message
                │
                │ If 3+ failures in last 5 minutes:   (BUILT — see notes below)
                │   Update merchant_settings: ai_status = 'paused', ai_paused_at = now()
                │   (Frontend banner still planned)
                │
                └── When the cooldown elapses, one half-open probe is allowed;
                    any success resets merchant_settings.ai_status = 'active'
```

**Important notes:**
- The classifier's cold-gate is deliberately biased toward recall — it's better to send a non-order to the full agent (wasted API call) than to miss a real order. A classifier outage fails open to the old RegEx filter rather than dropping the message.
- There is no more "auto-clarify on/off" branch point — the agent always keeps gathering details by asking; the only thing `ai_auto_clarify` no longer controls in the new design is whether uncertain orders get created live (they never do now — see below).
- **The actual pipeline (`process.ts`) differs from this sketch** and is authoritative (`07_AI_PIPELINE.md`): it debounces bursts (8s, last-message-wins), runs a cheap LLM classifier cold-gate (not RegEx), maintains one `collecting` draft order per conversation that the agent gathers details into across turns, validates Gemini's output deterministically as a **stage gate** (not just a flag), only promotes to a live `incoming` order after the customer confirms a readback **and** the deterministic validator agrees the order is finalizable, sends the handoff message only on genuine escalation (`needs_human`) rather than on low confidence, dedups orders per source message, and writes one `ai_decisions` audit row per Gemini call.
- **Confidence no longer gates order creation.** The old design compared `confidence >= threshold` to decide whether to auto-create, clarify, or propose. The new design gates on deterministic finalizability + explicit customer confirmation instead; `ai_confidence_threshold` is currently vestigial for this purpose (still recorded, still passed to Gemini, not used to branch). See `07_AI_PIPELINE.md`.
- **The below-threshold `ai_proposal` status is dormant, not removed.** The AI pipeline no longer creates `ai_proposal` orders (the `collecting` status supersedes that flow); the status, UI, and quota/dashboard treatment remain for historical rows and as a safety net.
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
