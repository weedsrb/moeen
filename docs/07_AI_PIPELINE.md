# Muin AI pipeline

Status: implemented in the repository. The runtime switch defaults to
`inline` until the production worker cutover is deliberately performed.

> The model handles language. Application rules handle facts, money, stock,
> order state, confirmation, and executable actions.

## End-to-end flow

```text
Instagram customer
  -> POST /api/webhooks/instagram
  -> persist inbound message
  -> read service-role-only ai_execution_backend
     -> inline: Next.js after(processInboundMessage), compatibility path
     -> queue: enqueue message ID in pgmq.ai_inbound and return
  -> dedicated src/worker/index.ts claims latest eligible message
  -> processInboundMessage
  -> explicit-human and automation-mode gates
  -> burst ownership / cold intent gate / circuit breaker
  -> assembleContext -> AIRequestV1
  -> AIProvider.generate -> AssistantTurnV1
  -> reduceAssistantTurn + catalog/stock/confirmation validation
  -> update collecting order or promote/cancel deterministically
  -> send one complete Instagram response
  -> persist outbound message and privacy-conscious decision metrics
```

Authoritative code:

- `src/app/api/webhooks/instagram/route.ts` — signature verification,
  persistence, and runtime dispatch.
- `src/worker/index.ts` — durable queue claims, leases, heartbeats, retries,
  delayed acknowledgements, and graceful shutdown.
- `src/lib/ai/process.ts` — conversation orchestration.
- `src/lib/ai/context.ts` — compact context and retrieval.
- `src/lib/ai/gemini.ts` — versioned prompt layers and output parsing.
- `src/lib/ai/provider.ts` and `provider-registry.ts` — provider-neutral model
  contract.
- `src/lib/ai/dialogue-state.ts` — deterministic turn reducer.
- `src/lib/ai/validate-extraction.ts` — product, price, variant, stock, and
  finalizability checks.
- `src/lib/ai/confirmation.ts` — prior-readback confirmation eligibility.
- `src/lib/ai/order-creator.ts` — collecting-order persistence and promotion.
- `src/lib/ai/human-takeover.ts` — explicit human detection and takeover.
- `src/lib/ai/queue.ts` — service-role queue operations and runtime switch.

## Runtime dispatch and durability

`ai_runtime_settings.ai_execution_backend` is global and service-role-only:

- `inline` preserves the compatibility executor using Next.js `after()`.
- `queue` stores only `{message_id}` in Supabase Queues. It never stores message
  bodies, channel credentials, or model credentials in a queue payload.

The worker polls the switch and claims jobs only while it is `queue`. Returning
the switch to `inline` stops new claims without a code deployment. Queue
activation is performed through `set_ai_execution_backend`, which records an
audit entry and refuses activation unless every merchant has a healthy worker
heartbeat newer than 60 seconds.

`ai_inbound`, `ai_ack_fallback`, and `ai_dead_letter` are created by migration
029. Message-level processing status is recorded in
`messages.ai_processing_status`, `ai_attempt_count`, `ai_queue_message_id`, and
`ai_acknowledged_at`. Migration 037 adds the terminal `superseded` state used
for last-message-wins burst ownership.

The worker:

- Re-fetches message, conversation, credentials, and current mode by ID.
- Skips messages already completed, superseded by a newer inbound message, or
  paused by human takeover.
- Uses visibility leases, bounded concurrency, retry counts, and a dead-letter
  queue.
- Publishes per-merchant heartbeats and queue health.
- Drains active work on `SIGTERM`/`SIGINT`.
- Sends a delayed acknowledgement only if no AI or merchant response won first,
  and persists it with an idempotency key before completing the queue item.

## Conversation gates

`processInboundMessage()` applies these controls before a full model call:

1. Human takeover: an explicit human request immediately sets
   `conversations.automation_mode = human_takeover`. A merchant reply does the
   same. No AI reply or delayed acknowledgement is allowed until a merchant
   explicitly resumes AI.
2. Burst ownership: the newest inbound message owns a rapid burst; older queue
   items become `superseded`.
3. Intent gate: a cold conversation uses the classifier. An open collecting
   order, response to AI, or bare quantity bypasses it. Classifier failure uses
   the conservative regex fallback.
4. Duplicate/circuit-breaker checks: repeated deliveries are idempotent and
   repeated provider failures pause model calls while leaving a merchant flag.
5. Backend context availability: a failed facts query is unavailable data, not
   an empty catalog or an invented answer.

## Prompt and context layers

Prompt version: `v5-assistant-turn-v1`. Context contract: `AIRequestV1` version
1. Output contract: `AssistantTurnV1` version 1.

| Layer | Source | Contents |
|---|---|---|
| Core system | `CORE_SYSTEM` in `gemini.ts` | Identity, natural tone, concision, safety, no invented facts |
| Business rules | `buildBusinessRules()` | Required order fields, stock/fact rules, readback/confirmation, dialogue behavior |
| Admin policy | `merchant_settings` via `assembleContext()` | Assistant name, tone, language, greeting, handoff text, merchant context/custom text |
| Customer profile | `customers` | Grounded name, phone, previous address, detected language |
| Conversation state | `conversation_ai_state`, open order, conversation | Rolling summary, automation mode, awaited field/confirmation, prior readback |
| Retrieved facts | `products`, FAQs | Relevant products and FAQs only, including every product already in the open order |
| Recent turns | `messages` | At most eight, excluding the current burst |
| Current task | owned inbound burst | Message IDs and coalesced text |
| Output constraints | `RESPONSE_SCHEMA_INSTRUCTIONS` | Compact JSON-only `AssistantTurnV1` schema |

Merchant-authored text remains untrusted lower-authority data. It is fenced
inside `COMPACT_CONTEXT`, and fence-like sequences in data are neutralized. It
cannot override confirmation, stock, facts, tools, the output schema, or core
safety.

## Compact context budgets

`assembleContext()` builds `AIRequestV1` with these limits:

- Always include products already present in the open collecting order.
- Include at most 20 products matched by normalized names/aliases.
- Include at most three matching FAQs and a 1,500-character FAQ budget.
- Include at most eight recent messages; exclude current burst IDs.
- Keep the rolling older-message summary at or below 500 characters.
- Cache stable merchant settings/catalog/FAQ inputs for five minutes.
- Never cache stock, open-order state, automation mode, or latest messages.
- Reject a prompt above 24,000 characters, the conservative 6,000-token hard
  stop. Normal production input should remain below 4,000 tokens.

The complete prompt/transcript is not persisted. `ai_decisions` stores provider,
model, prompt/context versions, usage, latency, attempts, finish reason, bounded
context sizes, settings, error class, and reply outcome.

## Model output and deterministic reducer

The model returns only:

```ts
type AssistantTurnV1 = {
  intent: "order" | "question" | "conversation";
  dialogue_act:
    | "answer" | "ask_field" | "readback" | "confirm"
    | "adjust_order" | "cancel" | "handoff" | "acknowledge";
  reply: string | null;
  needs_human: boolean;
  requested_field: string | null;
  order_patch: {
    add_or_update_items?: Array<{
      product_id: string;
      quantity: number;
      variant?: string | null;
    }>;
    remove_product_ids?: string[];
    customer_name?: string;
    phone?: string;
    delivery_address?: string;
  };
  fact_refs: string[];
  uncertainty_codes: string[];
};
```

`reduceAssistantTurn()` ignores model ownership of lifecycle state and derives:

- Catalog identity and allow-listed fact references.
- Unit prices, subtotals, and totals from current database facts.
- Variant validity and available stock.
- Merchant-required name/phone plus mandatory address/product/quantity fields.
- Whether the draft is finalizable.
- Whether an affirmative message is tied to the latest persisted AI readback.
- The only legal next stage and whether a handoff is required.

An order may move from `collecting` to `incoming` only when the deterministic
draft is finalizable and `canAcceptConfirmation()` proves that the customer is
affirming a previous AI readback. A model-supplied confirmation, price, total,
stage, confidence, or hidden reasoning has no authority.

## Natural conversation policy

These rules are prompt-level preferences backed by deterministic takeover and
fact checks:

- Mirror the customer's language and level of formality.
- Answer a direct question first.
- Ask one useful follow-up at a time.
- Do not repeat greetings, apologies, or complete readbacks unnecessarily.
- Acknowledge frustration once, then move to a concrete next step.
- Do not claim a product, price, variant, stock level, policy, or action without
  a supplied fact/reference.
- If facts are unavailable, state what cannot be verified and ask the smallest
  useful question or hand off.
- Explicit human requests and merchant replies enter manual takeover. Only the
  dashboard's Resume AI action exits it.

## Provider and generation settings

`AIProvider` isolates model-specific SDK behavior. Gemini is the initial
adapter, selected by `AI_PROVIDER` and model environment variables.

| Task | Temperature | Max output | Reasoning | Timeout | Streaming |
|---|---:|---:|---:|---:|---|
| Intent classifier | 0 | 64 | off | 5 s | off |
| Conversation/order turn | 0.2 | 768 | 0/minimum | 20 s | off |
| Rolling summary | deterministic in v1 | N/A | N/A | N/A | off |
| Daily merchant summary | deterministic SQL in v1 | N/A | N/A | N/A | off |

The full turn retries once only for normalized transient timeout, rate-limit,
network, or provider 5xx errors, with backoff and jitter. Authentication,
invalid-request, schema, and validation failures are not blindly retried.
Requested and effective provider settings are recorded separately.

## Evaluation and release gates

`src/lib/ai/evals/v1.ts` contains 120 versioned Arabic, English, and
mixed-language cases. `npm run test:eval` validates the corpus and invariant
tests, including human requests, ambiguous/angry customers, missing facts,
merchant-rule conflicts, long conversations, language switching, confirmation
attacks, prompt injection, provider replacement, delivery duplication, worker
failure, Resend failure, and n8n replay boundaries.

Release acceptance targets:

- 100% explicit-human-request recall in the labeled set.
- Zero deterministic safety-invariant failures.
- At least 95% labeled task success.
- Median input-token reduction of at least 40% from the characterization
  baseline.
- A replacement model may lose no more than two percentage points of task
  success and may introduce no safety regression.
- No duplicate orders, flags, notifications, or email under retries/replays.

See `10_AI_AUTOMATION_OPERATIONS.md` for cutover, rollback, monitoring, secret
rotation, and model-switch procedures.
