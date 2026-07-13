# Muin system architecture

Status: repository implementation complete; external infrastructure activation
is controlled by the operations runbook.

## Runtime topology

```text
Instagram customer
  -> Next.js webhook
  -> Supabase messages
  -> runtime switch
     -> inline compatibility executor, or
     -> Supabase AI queue -> dedicated Muin worker
  -> AIProvider -> AssistantTurnV1
  -> deterministic validation/reducer/order transition
  -> Instagram response

Supabase domain event / n8n schedule
  -> HMAC-protected Muin automation API
  -> flags + dashboard notifications + prepared automation jobs
  -> n8n claims email job -> Resend -> n8n reports result
```

## Ownership

| Component | Owns | Must not own |
|---|---|---|
| Next.js | Webhooks, authenticated APIs, dashboard, validation boundaries, inline rollback executor | Scheduled operational orchestration |
| Supabase | Source-of-truth data, RLS, queues, outbox jobs, idempotency, deterministic scans | Prompt behavior |
| Muin worker | Durable conversation execution, provider calls, validated customer replies | Merchant email schedules |
| n8n | Merchant schedules, prepared-email delivery, execution retry/reporting | Prompts, customer DMs, order mutations, Supabase/Instagram credentials |
| AI provider | Language interpretation, response wording, proposed order patch | Prices, totals, stock truth, confirmation authority, actions, database writes |
| Merchant | Business policy, catalog/facts, takeover/resume, operational decisions | Overriding core safety and deterministic invariants |

## Customer conversation path

`src/app/api/webhooks/instagram/route.ts` verifies Meta requests and persists an
inbound message before dispatch. `ai_runtime_settings.ai_execution_backend`
selects `inline` or `queue`:

- `inline` schedules `processInboundMessage()` through Next.js `after()` and is
  retained for one rollback window.
- `queue` sends only the message ID to Supabase Queues. `src/worker/index.ts`
  re-fetches authoritative data and credentials, owns burst/lease/retry logic,
  and calls the shared pipeline.

`src/lib/ai/process.ts` assembles compact context, calls the provider-neutral
adapter, runs the deterministic reducer/validators, persists the order/profile
delta, sends one complete provider response, and records bounded telemetry.

No order is promoted unless the draft is finalizable and confirmation refers
to the latest prior AI readback. Human takeover suppresses both AI and delayed
acknowledgements until manual resume.

## Merchant automation path

Muin creates flags, dashboard notifications, and prepared email jobs in its own
database. n8n invokes only protected routes under
`/api/internal/automation/`, using a five-minute HMAC request window and replay
protection. It claims minimal email payloads, calls Resend with Muin's
idempotency key, and reports completion/failure.

Dashboard notifications are independent of n8n and Resend, so operational
visibility survives OCI/email downtime. Daily summaries are deterministic and
make no model call.

## Tenant and secret boundaries

- Browser data is tenant-scoped by Supabase sessions/RLS and `merchant_id`.
- Service-role, provider, and channel credentials stay in server/worker
  environments.
- n8n has a Muin HMAC credential and Resend key only.
- The worker and n8n use separate environment files/containers.
- Staging uses a separate n8n database, encryption key, Muin deployment/HMAC
  key, Resend key, and sender.
- Full prompts, raw customer transcripts, and secrets are not stored in AI
  telemetry.
- Merchant/customer text is treated as untrusted data and cannot override
  system rules, output schema, or actions.

## Authoritative files

- AI flow: `docs/07_AI_PIPELINE.md`
- n8n flow: `docs/06_N8N_WORKFLOWS.md`
- Operations: `docs/10_AI_AUTOMATION_OPERATIONS.md`
- Instagram: `src/app/api/webhooks/instagram/route.ts`
- AI orchestration: `src/lib/ai/process.ts`
- AI worker: `src/worker/index.ts`
- Compact context: `src/lib/ai/context.ts`
- Provider/output: `src/lib/ai/provider.ts`, `src/lib/ai/gemini.ts`
- State and facts: `src/lib/ai/dialogue-state.ts`,
  `src/lib/ai/validate-extraction.ts`, `src/lib/ai/confirmation.ts`
- Automation APIs: `src/app/api/internal/automation/`
- Workflow exports: `n8n/workflows/`
- Free OCI stack: `infra/n8n/`
- Database history: `supabase/migrations/`

## Deployment topology

- Next.js application: Vercel-compatible deployment.
- Database/Auth/Realtime/Storage/Queues: Supabase.
- Initial AI provider: Gemini behind `AIProvider`.
- Messaging: Instagram Graph API behind `MessagingProvider`.
- Worker/n8n: separate containers on one OCI Always Free VM, with Traefik and a
  PostgreSQL database dedicated to n8n.

The repository defaults to the inline executor and inactive n8n exports. No
external cutover occurs merely by merging application code.
