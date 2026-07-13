# Mo'een n8n workflow specification

Status: approved architecture, not yet deployed.

## Boundary

n8n is a merchant-operations runner. It does not receive Instagram webhooks, run customer prompts, call the conversational model, mutate orders directly, or send customer messages. The Muin application and dedicated worker retain those responsibilities.

n8n accesses business operations only through HMAC-authenticated Muin endpoints. It stores a Muin HMAC credential and a Resend credential, never a Supabase service-role key or Instagram token.

## Workflow inventory

| Workflow | Trigger | Result | AI |
|---|---|---|---|
| New order alerts | Durable `collecting -> incoming` job | Merchant dashboard notification and optional email | No |
| Customer wait monitor | Every 5 minutes | Upsert/resolve waiting flags and critical email jobs | No |
| Inventory alerts | Threshold-crossing job plus reconciliation | Upsert/resolve stock flags and optional email | No |
| Stale order monitor | Every 30 minutes | Upsert/resolve stale-order flags and optional email | No |
| Daily summary | Every 15 minutes; merchant local due time | Deterministic dashboard/email summary | No |
| Workflow health | Every 5 minutes | Retry expired leases and report repeated failures | No |

The former Incoming Message Handler is retired from the n8n design. The former customer Order Status Notification workflow is replaced by merchant-only new-order and exception alerts.

## Protected API contract

Planned endpoints:

- `POST /api/internal/automation/schedules/:type`
- `POST /api/internal/automation/jobs/claim`
- `POST /api/internal/automation/jobs/:id/complete`
- `POST /api/internal/automation/jobs/:id/fail`
- `POST /api/internal/automation/errors`

Every request includes a key ID, timestamp, SHA-256 body hash, and HMAC signature. Muin rejects unknown keys, signature mismatch, timestamps outside five minutes, and replayed signatures.

The claim response contains a minimal prepared job: job ID/type, idempotency key, recipient, locale, subject/text/HTML, severity, and non-sensitive entity reference. n8n sends email through Resend and reports the provider result. Dashboard notifications and flags are created by Muin, not by arbitrary n8n SQL.

## Idempotency and retries

- `automation_jobs.dedupe_key` is unique.
- Jobs are claimed with a lease; expired leases become claimable again.
- Resend uses the same idempotency key as the job.
- Transient failures retry with exponential backoff and jitter, to a fixed attempt limit.
- Permanent or exhausted failures remain visible on the dashboard and in the workflow error audit.
- Workflow effects are safe when n8n repeats a request or crashes after delivery.

## Default policies

- Customer waiting: medium after 60 minutes, critical after 120 minutes.
- Stale incoming order: medium after 30 minutes, critical after 120 minutes.
- Stale pending order: critical after 24 hours.
- Stale confirmed order: medium after 48 hours.
- Daily summary: 21:00 in the merchant timezone.
- Low-stock thresholds reuse the merchant/product inventory settings.
- Quiet hours delay noncritical email; critical behavior is merchant-configurable.
- Dashboard delivery remains available when n8n or Resend is unavailable.

## Free self-hosting target

One Oracle Cloud Always Free VM runs separate Docker containers for:

- Traefik for HTTPS and reverse proxying.
- n8n Community Edition in regular mode.
- PostgreSQL dedicated to n8n state.
- The Muin AI worker, which connects to Supabase but not the n8n database.

Redis and n8n queue mode are intentionally omitted at the initial scale. Supabase owns Muin's durable AI queue and automation job records. Workflow JSON is exported without credentials into `automation/n8n/workflows/` because Community Edition does not provide native Git-backed environments.

Required operations include pinned image versions, health checks, restricted SSH/firewall rules, execution pruning, PostgreSQL backups, encryption-key backup, restore drills, secret rotation, and a disabled staging profile with separate database/credentials.

## Explicit non-goals

- No customer-facing order status DMs from n8n.
- No AI-generated daily narrative in v1.
- No direct Supabase REST/RPC access from n8n.
- No prompt text or model configuration inside workflows.
- No order state transitions inside workflows.
