# Mo'een system architecture

This document separates deployed behavior from the approved worker/n8n target so implementation decisions do not depend on stale Telegram or n8n diagrams.

## Deployed architecture

```text
Instagram customer
  -> Meta webhook
  -> POST /api/webhooks/instagram
  -> resolve merchant/customer/conversation
  -> persist inbound message in Supabase
  -> return 200 to Meta
  -> Next.js after(processInboundMessage)
  -> 8-second last-message-wins burst coalescing
  -> intent classifier when the conversation is cold
  -> context assembly + Gemini 2.5 Flash
  -> deterministic product/price/variant/stock validation
  -> collecting-order update, confirmation, cancellation, or escalation
  -> provider-agnostic outbound send
  -> persist outbound message and AI decision audit
```

Authoritative entry points:

- `src/app/api/webhooks/instagram/route.ts`
- `src/lib/ai/process.ts`
- `src/lib/ai/context.ts`
- `src/lib/ai/gemini.ts`
- `src/lib/ai/validate-extraction.ts`
- `src/lib/ai/order-creator.ts`

The deployed pipeline has no n8n dependency. `after()` is bounded by the route's deployment lifetime, which is why durable execution is planned.

## Approved target architecture

```text
Instagram webhook -> Supabase message -> Supabase AI queue -> Muin AI worker
                                                       -> provider adapter
                                                       -> deterministic reducer
                                                       -> Instagram reply

Supabase domain event -> automation job -> protected Muin API <- n8n schedule
                                                      n8n -> Resend merchant email
                                                      Muin -> dashboard flag/notification
```

### Ownership boundaries

| Component | Owns | Must not own |
|---|---|---|
| Next.js | Webhooks, authenticated APIs, dashboard, validation boundaries | Long-running AI execution |
| Supabase | Source-of-truth records, RLS, durable queues/jobs, idempotency | Prompt behavior |
| Muin AI worker | Context building, provider calls, deterministic dialogue/order orchestration, customer replies | Merchant scheduled automation |
| n8n | Merchant alert schedules, Resend delivery, retry orchestration | Prompts, customer replies, order mutations, Supabase service-role credentials |
| AI provider | Language interpretation and proposed reply/state delta | Prices, totals, stock truth, confirmation authority, database writes |

## Security boundaries

- Webhook and internal Route Handlers are public network endpoints and validate authentication at the handler.
- Browser clients use tenant-scoped Supabase sessions; service-role access remains server-only.
- n8n receives only a rotating HMAC credential and minimal prepared job payloads.
- Provider and customer content is treated as untrusted data and cannot override core rules.
- Internal IDs are included in model context only when required to validate a proposed action.
- Full prompts and raw credentials are not written to logs or AI audit rows.

## Current settings truth

The live pipeline reads persona, tone, greeting, business context, custom instructions, response language, handoff message, acknowledgement settings, confidence threshold, and auto-clarify. The last two are legacy controls: deterministic finalizability and confirmation now gate order creation, while the agent always asks for required details. The settings UI still describes the older behavior and is scheduled for replacement.

## Known baseline risks

- `orders.ai_collection_state` stores confirmation metadata but the live context does not load it back.
- The current message can appear in recent history and again as the current task.
- Large-catalog filtering can omit products already present in an open order.
- Context query failures are treated like empty data in several places.
- Customer profile fields are not consistently injected or persisted after validation.
- A handoff flag does not currently suspend AI, and a merchant reply does not take over the conversation.
- The full prompt repeats catalog/FAQ/context blocks and allows up to 8,192 output tokens plus thinking.
- AI execution depends on `after()` and an immediate retry rather than a durable queue.
- n8n workflows, worker infrastructure, notification jobs, and regression evaluations are not yet implemented.

## Deployment baseline

- Next.js: Vercel
- Database/Auth/Realtime/Storage: Supabase Cloud
- AI: Gemini API
- Messaging: Instagram Graph API through `MessagingProvider`
- Scheduled application cron: Vercel cron for Instagram token refresh
- n8n/worker: not deployed yet
