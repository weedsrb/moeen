# Muin n8n workflows

Status: implemented as inactive, credential-free exports. Activation is an
operations step, not part of application deployment.

## Boundary

n8n is a merchant-operations runner. It does not receive Instagram webhooks,
assemble prompts, call the conversation model, read or mutate Supabase
directly, change orders, or send customer messages.

Muin owns domain scans, flags, dashboard notifications, job preparation,
deduplication, and protected APIs. n8n owns schedules, claiming prepared email
jobs, Resend delivery, and reporting success/failure.

The n8n container receives only:

- Muin application base URL.
- A rotatable Muin HMAC key ID and secret.
- Resend API key and verified sender.
- n8n's own PostgreSQL and encryption credentials.

It never receives a Supabase service-role key, Gemini key, Instagram token, or
direct database connection. The separate `muin-worker` container has its own
mode-0600 environment file and is not exposed to n8n.

## Implemented workflow inventory

All exports live under `n8n/workflows/` and have `active: false`.

| Export | Trigger | Muin result | Email behavior |
|---|---|---|---|
| `new-order-alerts.json` | Every minute; domain event is transaction-triggered on `collecting -> incoming` | Dashboard notification and prepared job | Optional; suppress merchant-originated transitions unless configured |
| `customer-wait-alerts.json` | Every 5 minutes | Upsert medium/critical waiting flags and resolve after response | First configured escalation; excludes AI-processing/ack window |
| `inventory-alerts.json` | Every 5 minutes; state transitions are transaction-triggered | Low/out-of-stock flags and notifications; resolve after restock | First crossing or critical escalation only |
| `stale-order-alerts.json` | Every 30 minutes | Deduplicated status/threshold flag and notification; resolve on status advance | Optional according to severity/preferences |
| `daily-summary.json` | Every 15 minutes | Deterministic localized metrics for merchants due in their timezone | Optional; no AI/model call |

The retired n8n Incoming Message Handler is intentionally absent. The retired
customer-facing Order Status Notification is replaced by merchant-only new
order and exception alerts.

## Domain implementation

`src/lib/automation/schedules.ts` dispatches allow-listed workflow types.
Database migrations own idempotent domain logic:

- `032_automation_api_and_new_orders.sql`
- `033_customer_wait_alerts.sql`
- `034_inventory_alerts.sql`
- `035_stale_order_alerts.sql`
- `036_daily_summary.sql`

Core tables:

- `merchant_automation_settings` — timezone, notification email, quiet hours,
  workflow toggles, thresholds, summary time, and email preferences.
- `merchant_notifications` — dashboard delivery independent of n8n/Resend.
- `automation_jobs` — prepared email outbox with unique dedupe/idempotency key,
  lease, attempts, and terminal result.
- `automation_workflow_errors` — operational error audit.
- `automation_hmac_replays` — signature replay prevention.
- Existing `flags` — actionable waiting, inventory, stale-order, handoff, and AI
  failure issues.

## Protected API

Implemented Route Handlers:

- `POST /api/internal/automation/schedules/[type]`
- `POST /api/internal/automation/jobs/claim`
- `POST /api/internal/automation/jobs/[id]/complete`
- `POST /api/internal/automation/jobs/[id]/fail`
- `POST /api/internal/automation/errors`

`readAuthenticatedAutomationRequest()` and
`verifyAutomationRequest()` enforce:

- Allow-listed key ID.
- Unix timestamp no older/newer than five minutes.
- SHA-256 hash of the exact request body.
- HMAC-SHA256 over method, path, timestamp, and body hash.
- Constant-time signature comparison.
- One-time signature storage to reject replay.

The claim response is a minimal prepared payload: job ID/type, idempotency key,
recipient, locale, subject, text/HTML, severity, and bounded entity reference.
n8n sends it through Resend using the job idempotency key, then reports the
provider message ID or a bounded error. It cannot submit arbitrary SQL or an
order mutation.

## Retry and failure semantics

- `automation_jobs.dedupe_key` prevents duplicate logical jobs.
- A claim creates a bounded lease; expired leases become claimable again.
- Resend receives the same stable idempotency key on every attempt.
- Success and permanent/exhausted failure are reported to Muin.
- A workflow execution error may also be written to the protected error API.
- Dashboard notifications already exist before email delivery; n8n, OCI, or
  Resend downtime cannot remove dashboard visibility.
- Noncritical email may be deferred by quiet hours or quota. Resend's monthly
  and daily usage is tracked by Muin before jobs are prepared.

## Defaults

- Customer waiting: medium at 60 minutes, critical at 120 minutes.
- Stale incoming order: 30/120 minutes.
- Stale pending order: 24 hours.
- Stale confirmed order: 48 hours.
- Daily summary: 21:00 in merchant timezone; due check every 15 minutes.
- Inventory: notify on healthy-to-low/out threshold crossing, severity upgrade,
  and resolve after restock.
- Dashboard delivery always on. Email only after a successful verification
  test and according to merchant workflow preferences.

## Free deployment

`infra/n8n/docker-compose.yml` targets one OCI Always Free Ampere VM:

- Traefik with automatic HTTPS.
- n8n Community Edition in regular mode.
- PostgreSQL dedicated to n8n.
- A separate Muin AI worker container.

Redis and n8n queue mode are intentionally omitted. n8n Community Edition does
not provide native Git-backed environments, so reviewed JSON exports are the
source-controlled promotion artifact. Production and the disabled staging
profile use separate PostgreSQL databases, n8n encryption keys, Muin endpoints,
HMAC keys, Resend keys, and senders.

Image versions are pinned. Successful execution payloads are not retained;
failed execution data is pruned after the configured window. Encrypted `age`
backups and restore scripts live in `infra/n8n/scripts/`.

See `infra/n8n/README.md` for host setup and
`docs/10_AI_AUTOMATION_OPERATIONS.md` for staging, activation, rollback,
backup, restore, and secret-rotation runbooks.
