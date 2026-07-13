# Mo'een — AI Pipeline Specification

> AI handles language. Rules handle logic. Humans handle judgment.

> **Architecture baseline:** this document describes the currently deployed
> in-process pipeline. The approved replacement preserves the same customer and
> order invariants but executes them in a durable Muin worker. n8n remains
> outside the customer-reply path; see `03_ARCHITECTURE.md` and
> `06_N8N_WORKFLOWS.md`.

---

## Pipeline Overview

The pipeline runs **in-process inside Next.js** — not in n8n. When an Instagram
DM arrives at `/api/webhooks/instagram`, the webhook saves the message and
returns 200 to Meta immediately, then schedules `processInboundMessage`
(`src/lib/ai/process.ts`) on a Next.js `after()` callback. Every stage below
runs in that background task.

> n8n "Workflow 1" in `06_N8N_WORKFLOWS.md` describes an alternative *external*
> orchestration of this same flow that was **never built**. This in-process
> orchestrator is the real, current implementation.

The AI is a **conversational order-taking agent**, not a one-shot extractor.
It gathers every required detail across turns, checks real stock as it goes,
reads the finished order back to the customer, and only becomes a live order
after the customer explicitly confirms.

```
Customer Message (Instagram DM) → webhook saves it, returns 200, schedules after()
    │
    ▼
Stage 0 · Burst Debounce (8s, last-message-wins)
    │   coalesces rapid multi-message fragments into ONE run / ONE Gemini call
    ▼
Stage 1 · Cold-Start Gate
    │   mid-conversation signal (open collecting draft, reply-to-AI, bare
    │   number) → ALWAYS process, skip straight to Stage 2
    │   otherwise → cheap LLM intent classifier (order/question/other);
    │   classifier failure fails open to a RegEx fallback filter
    ▼
    Content-window dedup (identical inbound text within 60s → skip)
    ▼
Stage 2 · Circuit Breaker Gate
    │   merchant's ai_status paused + cooldown active → fast-fail to
    │   ai_unavailable, no Gemini call
    ▼
Stage 3 · Context Assembly
    │   (last 6 messages + compressed catalog + merchant AI settings + FAQ +
    │    the open collecting order rendered as "order so far")
    ▼
Stage 4 · Gemini 2.5 Flash — the order-taking agent
    │   (untrusted input sandboxed in <<<DATA:…>>> fences; 1 retry)
    │   → { intent, order_stage, items[], customer_info, missing_fields[],
    │       reply_to_customer, needs_human, confidence, reasoning }
        ▼
Stage 5 · Deterministic Validation (stage-gating)
    │   allow-list product_ids · recompute prices/totals from the catalog ·
    │   check stock ≤ available · check variant is offered ·
    │   any hard problem forces the stage back DOWN to `collecting`
        ▼
Stage 6 · Collecting Order Lifecycle
    │   upsert the ONE open `collecting` draft for this conversation, or
    │   promote it to `incoming` (finalize gate), or cancel it
        ▼
    Send exactly one reply (readback / next question / availability notice /
    ack / handoff) · ai_decisions audit row written (one per Gemini call)
```

---

## Stage 0: Burst Debounce

Customers rarely send a whole order in one message. They fire fragments: "بدي",
then "3 كيلو", then "العنوان رام الله". Without coalescing, each fragment would
trigger its own Gemini call.

`DEBOUNCE_MS = 8_000` (in `process.ts`) implements a **last-message-wins**
window:

- Every inbound text message schedules its own pipeline run.
- Each run sleeps ~8s, then checks whether a *newer* inbound text message exists
  in the conversation (ordered by `created_at, id` descending). If one does, this
  run **yields silently** — the successor owns the whole burst.
- The surviving (last) run gathers the trailing run of unprocessed inbound text
  messages (bounded to the last 5 minutes / 10 rows), concatenates them
  oldest→newest into a single `effectiveContent`, and runs the rest of the
  pipeline **once** over the combined text. `ai_processed` is then set on the
  whole burst; the extraction (`ai_result`) is written to the triggering message.

The manual reprocess endpoint sets `skipDebounce` — it runs inline on a single
historical message and never sleeps.

---

## Stage 1: Cold-Start Gate

**Purpose:** decide, cheaply, whether a message needs the full order-taking
model at all. This used to be a rigid RegEx filter — a hard recall ceiling
where an order phrased unusually could never reach Gemini. It is now a
**cheap LLM intent classifier**, with the RegEx retained only as a fail-open
fallback.

### Always process (skip the classifier entirely)

Three mid-conversation signals mean the message is unambiguously part of a
live order, so the classifier is bypassed and Gemini always runs:

1. **An open `collecting` draft exists for this conversation** — every message
   from here on is part of that live exchange (an address, a "yes", a bare
   number), so the stage machine must see it.
2. **Reply to an AI message** — the conversation's last outbound `sender_type`
   is `"ai"` (the AI just asked a question).
3. **Bare numbers** like `3` or `12` — almost always a quantity answer.

### Otherwise: classify

For a cold conversation with none of the above, `classifyIntent()`
(`src/lib/ai/classify-intent.ts`) calls a cheap, fast model
(`AI_CONFIG.classifierModel`, currently `gemini-2.5-flash-lite`) with a tiny,
deterministic prompt (`temperature: 0`, `maxOutputTokens: 50`, no thinking
budget) and returns exactly one of `"order" | "question" | "other"`:

- `order` or `question` → proceed to the full pipeline.
- `other` → mark the burst `ai_processed`, skip Gemini entirely.

The classifier's untrusted inputs (the message, recent history) are wrapped in
`<<<DATA:…>>>` fences with the same `neutralizeFences()` defense used by the
main agent prompt (see Stage 4) — a customer can't use classifier input to
smuggle instructions either.

### Fail-open fallback

If the classifier call throws for any reason (API failure, malformed output,
schema mismatch), the gate **fails open** to the original RegEx filter
(`src/lib/ai/regex-filter.ts`, patterns below) rather than silently dropping
the message. A classifier outage degrades the gate back to the old recall
ceiling for that one message — it never drops a real order outright.

Classifier-only skips are **not** written to `ai_decisions` — audit volume
stays proportional to full-model (Gemini extraction) spend, not raw chat
volume. They're logged with the `[AI Pipeline]` tag only.

### RegEx patterns (fallback only)

<details>
<summary>Arabic / English / Arabizi patterns still used as the fallback filter</summary>

```regex
# Arabic — "I want"
بدي|اريد|عايز|ابي|نبي|ابغى

# Arabic — "Order"
اطلب|طلب|طلبية|اوردر|اوصي|أوصي

# Arabic — "Send me" / "Give me"
ابعتلي|ابعثلي|اعطيني|حطلي|جيبلي

# Quantity + noun (number followed by Arabic word)
\d+\s+[؀-ۿ]+

# Price inquiry
كم سعر|كم حق|بكم|شو السعر|كم الحبة

# Delivery keywords
توصيل|وصلولي|عنواني|العنوان|ارسلولي

# Confirmation
اي تمام|ماشي|اوكي|موافق|بدي اياه

# English — direct order intent
\b(order|want|need|buy|purchase|get me)\b

# English — quantity
\b\d+\s*(pieces?|items?|kg|kilo|dozen)\b

# English — price inquiry
\b(how much|price|cost)\b

# English — delivery
\b(deliver|shipping|address|send to)\b

# Arabizi — order words
\b(bidi|biddi|abgha|atlobi|talabiye)\b

# Arabizi — "send me"
\b(ib3atli|jibli|hatli)\b
```

Bypass patterns (never reach even the fallback filter): greetings-only,
thanks-only, a single 1–3 emoji, and bare acknowledgments — but only when the
**entire** message is one of those, nothing else. "شكراً وبدي كمان 2" (thanks,
and I want 2 more) still passes because the combined message carries order
signal.

</details>

---

## Stage 2: Circuit Breaker Gate

Before spending a Gemini call, the pipeline checks the merchant's
`ai_status` (`merchant_settings`, migration 018):

- **`active`** → proceed normally.
- **`paused`, cooldown still active** → **fast-fail**: mark the burst
  processed, raise/extend an `ai_unavailable` flag, write an `ai_decisions`
  row (`gemini_confidence: null`), and return — no Gemini call.
- **`paused`, cooldown elapsed** → allow exactly one **half-open probe**
  through to Gemini.

The breaker **trips** after 3 `ai_unavailable` failures in a 5-minute window
(`ai_status → 'paused'`, `ai_paused_at → now()`), and **resets** to `active` on
any subsequent Gemini success. The cooldown is 10 minutes. It fails open — a
breaker read/write error never blocks the pipeline. The merchant-facing "AI
paused" banner UI is still planned.

---

## Stage 3: Context Assembly

`assembleContext()` (`src/lib/ai/context.ts`) fetches, in parallel:

- **Conversation history** — the last 6 messages (inbound and outbound),
  rendered as `[Customer]: … / [Mo'een AI]: …` lines.
- **Compressed catalog** — active products only, `{id, name, alt, price,
  variants, stock}`. If the catalog exceeds 50 products, names/alt-names are
  normalized (Arabic diacritics, alef/hamza/taa-marbuta variants, light
  Arabizi) before matching against the message's words, and the result is
  capped at 50 products so a broad match can't blow the token budget.
- **Merchant AI settings** — persona, tone, greeting, response language,
  business description, custom instructions, currency, handoff message,
  auto-clarify.
- **FAQ knowledge base** — injected up to a total character budget (~4000
  chars); additional entries beyond the budget are omitted with a note, so an
  unbounded FAQ can't bloat the prompt.
- **The open collecting order for this conversation** ("order so far") — its
  line items, delivery address, and running total, rendered as plain text (or
  `"(no order yet)"` if none exists yet). This is what lets the agent
  *remember* the order across turns instead of re-deriving it from raw
  message history every time.

`context` also exposes `hasOpenCollectingOrder` and `collectingOrderId` so the
cold gate (Stage 1) and the stage machine (Stage 6) don't need to re-query.

---

## Stage 4: Gemini — The Order-Taking Agent

### Prompt structure

Same strict data/instruction separation as before: trusted system rules first,
then each untrusted input isolated inside a labeled `<<<DATA:LABEL>>> …
<<<END:LABEL>>>` fence, then the response-schema instructions. No
`String.replace` substitution — trusted scalars (currency) are interpolated
via template literal; untrusted blocks are inserted via a replacer function so
`$`-patterns in customer text can't corrupt the prompt.

**Data fences, in order:**

```
<<<DATA:MERCHANT_CONTEXT>>>   … persona/tone/greeting/business description/FAQ …
<<<DATA:CATALOG>>>            … compressed catalog JSON …
<<<DATA:ORDER_SO_FAR>>>       … the running order, or "(no order yet)" …
<<<DATA:CONVERSATION>>>       … last-6-message history …
<<<DATA:CURRENT_MESSAGE>>>    … the debounce-coalesced customer text …
```

Before fencing, `neutralizeFences()` weaves a zero-width space through any run
of 2+ `<`/`>` characters so a customer (or the merchant's own catalog/context
text) can never forge a literal `<<<DATA:…>>>` boundary.

### What the agent is instructed to do

Unlike the old one-shot extractor, the system rules now describe a
**conversation**, not a single extraction:

1. Detect intent: order, question, or general conversation.
2. For an order — gather **every** required field by asking, one natural
   question at a time, in the customer's language: product(s), quantity,
   variant (only when the product actually offers variants), delivery
   address. Customer name/phone are optional context, not required.
3. **Consult the catalog's `stock`.** Never promise more than what's
   available — if the customer asks for more, state the real available
   quantity and ask them to adjust. Never invent products, prices, stock, or
   customer details.
4. **Maintain the running order** using `ORDER_SO_FAR` — merge the new
   message into it; a customer can change their mind mid-conversation and the
   latest statement wins.
5. Set `order_stage`:
   - `collecting` — still missing something or not fully fulfillable; keep
     asking.
   - `ready_to_confirm` — everything required is present and fulfillable;
     `reply_to_customer` must be a concise **readback** (items, quantities,
     variants, total, address) ending in a yes/no confirm question.
   - `confirmed` — **only** after the customer has affirmatively agreed to a
     readback that was already sent on a prior turn. The agent is explicitly
     forbidden from jumping straight to `confirmed`.
   - `cancelled` — the customer called it off.
   - `none` — not an order.
6. Put the single message to send this turn in `reply_to_customer` — a
   question, an availability notice, the readback, an acknowledgement, or an
   answer to a question.
7. Set `needs_human` **only** for genuine escalation (an explicit request for
   a human, or being truly stuck / out of scope). It is explicitly **not** a
   proxy for low confidence.

### Response schema (`geminiResponseSchema`, `src/lib/ai/types.ts`)

```json
{
  "intent": "order" | "question" | "other",
  "confidence": 0.87,
  "order_stage": "none" | "collecting" | "ready_to_confirm" | "confirmed" | "cancelled",
  "items": [
    {
      "product_id": "prod_001",
      "product_name": "كنافة نابلسية",
      "variant": "كبيرة",
      "quantity": 3,
      "unit_price": 40,
      "subtotal": 120,
      "match_confidence": 0.95
    }
  ],
  "customer_info": { "name": null, "delivery_address": "نابلس شارع الحسين", "phone": null },
  "missing_fields": [],
  "reply_to_customer": "بدك 3 كنافة كبيرة توصيل نابلس شارع الحسين، المجموع 120 شيكل. أأكد الطلب؟",
  "needs_human": false,
  "reasoning": "Customer confirmed product, quantity, and address. Ready to confirm."
}
```

`clarifying_question`, `answer`, `needs_human_review`, and `order_total` are
kept in the Zod schema as **optional/deprecated** fields (so historical
`ai_result` rows still parse), but the current prompt no longer asks the model
to populate them — `reply_to_customer` carries every outbound message now.

### `callGemini` signature

`callGemini(conversationHistory, catalog, settings, currentMessage,
merchantContext, orderSoFar)` — the `orderSoFar` string (Stage 3) is a
**required** 6th parameter; every call site must pass it.

### Prompt versioning

`AI_CONFIG.promptVersion` is `"v3"` for this agent-shaped prompt (it was
`"v2"` for the one-shot extractor). Bump it again whenever the SYSTEM rules
change materially — it's persisted per-row in `ai_decisions` for auditability
and safe A/B comparison.

---

## Stage 5: Deterministic Validation (Stage-Gating)

**Gemini's output is untrusted.** It can hallucinate `product_id`s that were
never in the catalog, invent prices, promise a variant that doesn't exist, or
promise more than is in stock. `validateExtraction()`
(`src/lib/ai/validate-extraction.ts`) — a pure, no-I/O function — reconciles
the extraction against the **exact catalog that was sent to Gemini**, and its
output now **gates the stage transition**, not just an advisory flag:

1. **Allow-list `product_id`** against the catalog. An id that isn't in the
   catalog is dropped to `null` (item becomes *unmatched*) and recorded in
   `diagnostics.invalidProductIds`.
2. **Recompute `unit_price` / `subtotal`** for matched items from the
   authoritative catalog price — never from Gemini's numbers. Unmatched items
   keep Gemini's numbers (no catalog price to substitute).
3. **Check stock** — matched items requesting more than `stock` are recorded
   in `diagnostics.outOfStockItems` with the requested vs. available amount.
4. **Check the variant is actually offered** by that product — an unoffered
   variant is recorded in `diagnostics.invalidVariants`. Products with no
   variants defined are never flagged (the merchant may not track variants).
5. **Recompute order totals** from the sanitized line items — Gemini's
   `order_total` is never trusted.

Three helpers built on top of the diagnostics drive the stage machine:

- **`hasHardAvailabilityProblem(validation)`** — true if any item is
  unmatched, over-stock, or has an invalid variant.
- **`isFinalizable(validation, missingFields)`** — true only when there are no
  missing fields, at least one item, and no hard availability problem. This is
  the deterministic half of the finalize gate (Stage 6).
- **`getStockShortfalls(validation, catalog)`** — structured
  `{productName, requested, available}` entries used to build a truthful
  availability reply if the model's own reply doesn't state the real numbers.

> This is the concrete expression of the tagline: **AI handles language, rules
> handle logic.** The model reads dialect and intent; deterministic code owns
> every number that touches money, stock, or the order's readiness to become
> real.

---

## Stage 6: Collecting Order Lifecycle & Decision Tree

There is at most **one open `collecting` order per conversation** — the
AI's working draft while it gathers details. A `collecting` order reserves no
stock, burns no quota, and is excluded from dashboard order counts until it
graduates.

### Resolving the real stage (never trust the model to upgrade past valid)

```
stage = geminiResponse.order_stage
if stage == "none": stage = "collecting"
if stage in ("ready_to_confirm", "confirmed") and
   (hasHardAvailabilityProblem or missing_fields.length > 0 or needs_human):
    stage = "collecting"   # force back down — cannot skip ahead
```

### Branches

| Resolved stage | Action | decision_case |
|---|---|---|
| `cancelled` | Cancel the open collecting order (if any); send the reply | `order_cancelled_by_customer` |
| `collecting` / `ready_to_confirm` (not finalizable) | Upsert the collecting draft (create if none exists and items are present, else overwrite items/address/state); raise flags for any invalid products / stock shortfalls / invalid variants; send exactly one reply | `order_collecting` or `order_ready_to_confirm` |
| `confirmed` **and** `isFinalizable` **and** an order exists | **Finalize gate passes** — promote `collecting → incoming` (status transition + timeline entry, `changed_by: "ai"`), send an acknowledgement | `order_confirmed` |
| `intent = "question"` | Send the answer (`question_answered`) or flag if none generated (`question_flagged`) | — |
| `intent = "other"` / stage `none` with no order in progress | Send `reply_to_customer` if present; no order created | `intent_other` |
| Gemini failure (after 1 retry) | `critical` / `ai_unavailable` flag; burst marked processed | `ai_unavailable` |

**The finalize gate is intentionally double-locked:** the model must say
`confirmed` *and* the deterministic validator must independently agree the
order is finalizable (no missing fields, every item matched, every quantity
≤ stock, every variant valid). An unfulfillable quantity or a hallucinated
product can never reach `incoming` — even if the customer says "yes" to a
model reply that (incorrectly) claims it's ready.

**Stock-truth override:** if a hard stock shortfall exists and the model's own
`reply_to_customer` doesn't state the real available amount, the reply is
**replaced** with a deterministic template ("Sorry, we only have {available}
of {product} right now…") before sending — the customer is never misled by an
optimistic model reply.

**Handoff is reserved for genuine escalation.** `settings.handoffMessage` is
sent, and a `human_requested` flag raised, **only** when `needs_human` is
true. Low confidence, missing fields, or an unfulfillable order do **not**
trigger a handoff — they just mean the AI keeps the conversation going. (This
replaces the old behavior where a below-threshold extraction always sent the
canned handoff line and stopped.)

### `ai_proposal` — retired (order lifecycle v2, migration 020)

Before this redesign, a below-threshold one-shot extraction created an
**`ai_proposal`** order (a status the merchant explicitly confirmed or
rejected). The stage machine above superseded that flow, and the pipeline
stopped creating `ai_proposal` orders — but for a while the status, its board
column, its transitions, and the quota/dashboard exclusions stayed in place
as dormant historical support. Migration 020 (order lifecycle v2) removed it
for real: existing `ai_proposal` rows were migrated to `cancelled`, the
status was dropped from the `orders_status_check` CHECK constraint, and
`createOrderFromAI` (the function that used to mint `ai_proposal`/`incoming`
orders directly, unused since this redesign) was deleted.
`upsertCollectingOrder` / `promoteCollectingToIncoming` /
`cancelCollectingOrder` (`src/lib/ai/order-creator.ts`) are the only order
lifecycle functions the AI pipeline calls now.

The same migration also retired the merchant-side `pending` status — the
finalize gate above already requires explicit customer confirmation before
an order reaches `incoming`, so a separate "awaiting confirmation" step was
redundant. The live lifecycle is now 6 statuses: `collecting → incoming →
confirmed → out_for_delivery → delivered`, with `cancelled` reachable from
any non-terminal state. Stock reservation moved one stage earlier —
`incoming` reserves stock (previously only `pending` did). `delivered` and
`cancelled` orders are surfaced in the Orders page's History tab rather than
the live board/list.

---

## Confidence Score — Now Informational, Not a Gate

**This is a behavior change worth flagging explicitly.** In the old one-shot
design, `confidence >= merchant's ai_confidence_threshold` was the primary gate
deciding whether an order was created live, clarified, or proposed. In the
conversational design, **confidence no longer drives the stage transition at
all.** The gate is now:

- **Deterministic finalizability** (Stage 5) — every item matched, in stock,
  valid variant, no missing fields.
- **Explicit customer confirmation** — the model must report `confirmed`,
  which by its own instructions only happens after the customer agreed to a
  readback.

`geminiResponse.confidence` is still returned by the model, still recorded on
`ai_decisions.gemini_confidence` for every call, and still passed through
`context.settings.confidenceThreshold` into `callGemini` — but the pipeline
never compares it against the threshold to decide anything. The merchant's
**Confidence Threshold** slider in Settings is therefore currently **vestigial
for order-gating purposes** (kept in the schema/UI, not removed, and reserved
for a possible future re-scoring signal — see below). This is worth surfacing
to merchants who previously tuned that slider expecting it to control
auto-creation.

> **Planned — deterministic re-scoring.** `effective_confidence` in the
> `ai_decisions` audit table currently *mirrors* the raw model score. A future
> re-scoring layer could adjust it (e.g. penalize unmatched line items) and
> potentially reintroduce a confidence-based signal into the stage machine —
> the column already exists to hold that value.

---

## Gemini API Configuration

All model + generation parameters are centralized in the frozen, exported
`AI_CONFIG` (`src/lib/ai/gemini.ts`) so every decision can be attributed to an
exact model/prompt revision (persisted per-row in `ai_decisions`):

```typescript
export const AI_CONFIG = {
  model: "gemini-2.5-flash",
  classifierModel: "gemini-2.5-flash-lite",   // cold-gate intent classifier
  promptVersion: "v3",     // bump when SYSTEM rules change materially
  temperature: 0.1,        // low temperature for consistent extraction
  maxOutputTokens: 8192,   // headroom for thinking budget + full JSON extraction
  topP: 0.95,
  topK: 40,
  thinkingBudget: 1024,    // Gemini 2.5 thinking tokens
} as const;
```

`classifierModel` id should be verified against the live Gemini model list
before relying on it in production — model ids change over time.

Requests also set `responseMimeType: "application/json"` to force JSON output.
If Gemini still returns truncated JSON, `repairTruncatedJson()` closes unclosed
strings/brackets before the response is validated against `geminiResponseSchema`.

**Why low temperature:** Order extraction needs precision, not creativity. The same message should produce the same output every time.

---

## Order Idempotency & Deduplication

Four independent guards prevent duplicate orders and duplicate Gemini spend:

1. **Intake idempotency** (webhook) — inbound messages are deduped on
   `platform_message_id` before insert.
2. **Content-window dedup** (pipeline, Stage 1) — a customer double-sending
   identical text produces distinct `platform_message_id`s (so intake dedup
   misses it). If an identical inbound message in the same conversation was
   already `ai_processed` within the last **60 seconds**, this run skips.
3. **One open collecting draft per conversation** — the stage machine only
   ever upserts a single `collecting` order per conversation; a burst of
   messages updates the same draft rather than minting new ones.
4. **Order-level idempotency** — a collecting/live order is keyed by its
   `source_message_id`; the manual reprocess endpoint re-running the pipeline
   on the same message never mints a second order.

---

## AI Decision Audit Trail (`ai_decisions`)

Every terminal Gemini path writes **one immutable `ai_decisions` row**
(migration 016, extended by migration 019). Volume tracks AI spend — one row
per model call — not raw chat volume; pre-Gemini skips (cold-gate skip,
content dedup, debounce yield, breaker fast-fail-without-a-call) are *not*
recorded except where noted. Writing is fire-and-forget: an audit failure
never breaks the pipeline.

Each row records:

- `model_version` + `prompt_version` — from `AI_CONFIG`, so a decision is
  attributable to an exact revision and prompt changes can be A/B compared.
- `input_hash` — sha256 of the effective (burst-coalesced) content that was
  scored, so identical inputs across runs stay comparable.
- `gemini_confidence` — the raw model score (NULL when Gemini failed or was
  fast-failed by the breaker).
- `effective_confidence` — equals `gemini_confidence` today; reserved for a
  future deterministic re-scoring layer (see *Confidence Score* above).
- `validation_diagnostics` — `{invalidProductIds, priceCorrections,
  outOfStockItems, invalidVariants}` from Stage 5 (order cases only).
- `decision_case` — the terminal branch. **Currently emitted values:**

  | decision_case | Meaning |
  |---------------|---------|
  | `ai_unavailable` | Gemini failed after retry, or the circuit breaker fast-failed |
  | `intent_other` | Non-order, non-question — no action |
  | `question_answered` | AI answered the customer's question |
  | `question_flagged` | Question with no answer → flag |
  | `order_collecting` | Order stage resolved to `collecting` — draft upserted, one reply sent |
  | `order_ready_to_confirm` | Order stage resolved to `ready_to_confirm` — readback sent |
  | `order_confirmed` | Finalize gate passed — draft promoted to a live `incoming` order |
  | `order_cancelled_by_customer` | Customer called off an in-progress order |

  Four **historical** values remain valid in the database `CHECK` constraint
  for backward compatibility with rows written before this redesign, but are
  **no longer emitted** by the current pipeline: `order_auto_created`,
  `order_clarify_sent`, `order_created_flagged`, `order_proposal_created`
  (all from the old one-shot Case A–D decision tree).

Rows are RLS-readable by the owning merchant; writes come from the service role
(no INSERT/UPDATE/DELETE policies — an immutable trail).

---

## Cost Estimation

**Free tier:** 250 requests/day

**Assumptions for 5 pilot merchants:**
- Each merchant receives ~50 messages/day
- Cold-gate classifier (cheap, flash-lite, no thinking) passes ~60% to the full agent (30 messages) — mid-conversation messages skip the classifier entirely and always proceed
- 5 merchants × 30 messages = 150 full-agent calls/day, plus a comparable number of cheap classifier calls on cold messages
- Well within free tier; the classifier call is small enough (50 output tokens, no thinking budget) that its cost is a rounding error next to the full agent call

**When paid tier is needed:**
- At ~10 merchants with high volume
- Gemini Flash pricing: ~$0.10 per 1M input tokens, ~$0.40 per 1M output tokens
- Average full-agent call: ~500 input tokens, ~300 output tokens
- Cost per call: ~$0.00017
- 1000 calls/day: ~$0.17/day = ~$5/month

---

## Training Data Strategy

Every successful AI extraction (merchant confirms without corrections) is valuable training data.

**What to store:**
- Input: raw customer message + conversation context
- Output: Gemini's structured extraction
- Validation: merchant confirmed = correct, merchant edited = partially correct (store corrections)

**Future use:**
- Fine-tune a custom model on Levantine Arabic order patterns
- Improve the cold-gate classifier's accuracy
- Build product name matching dictionaries
- This becomes Mo'een's long-term competitive moat

**Storage:** Separate `ai_training_data` table in Supabase (Phase 2)
