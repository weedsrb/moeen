# AI worker and n8n operations

This runbook activates, observes, rolls back, backs up, and recovers Muin's AI
worker and merchant automation. Repository changes do not perform an external
deployment or enable a workflow automatically.

## Release invariants

Do not proceed if any invariant fails:

- The application is healthy with `ai_execution_backend = inline`.
- All migrations through `037_ai_worker_cutover.sql` are applied.
- `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` pass.
- Worker heartbeat is fresh for every merchant before switching to `queue`.
- All imported n8n workflows are disabled until their individual dry run.
- n8n has no Supabase service-role, Gemini, Instagram, or other channel secret.
- Production and staging use different databases, encryption keys, Muin HMAC
  keys/endpoints, Resend keys/senders, and n8n owner accounts.
- A current encrypted off-host n8n backup and a recent restore drill exist.
- Dashboard notifications work while n8n and Resend are stopped.

## Required configuration

Application/server environment:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
AI_PROVIDER=gemini
GEMINI_CONVERSATION_MODEL=gemini-2.5-flash
GEMINI_CLASSIFIER_MODEL=gemini-2.5-flash-lite
MUIN_AUTOMATION_HMAC_KEYS={"n8n-prod-1":"replace-with-secret"}
```

The JSON key map permits overlap during HMAC rotation. The single
`MUIN_AUTOMATION_HMAC_KEY_ID`/`MUIN_AUTOMATION_HMAC_SECRET` pair remains a
supported fallback.

OCI host files:

- `infra/n8n/.env`, based on `.env.example`, mode `0600`.
- `infra/n8n/.env.worker`, based on `.env.worker.example`, mode `0600`.

Keep both outside Git. Only `.env.worker` contains the Supabase service-role and
Gemini keys. The n8n service receives the Muin HMAC and Resend variables from
`.env`; it never mounts `.env.worker`.

## Pre-deployment validation

From the repository root:

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
bash -n infra/n8n/scripts/backup.sh
bash -n infra/n8n/scripts/restore.sh
bash -n infra/n8n/scripts/cutover-ai.sh
```

On a machine with Docker/Compose and populated non-production environment
files:

```bash
cd infra/n8n
docker compose config --quiet
```

The committed regression set is run with `npm run test:eval`. It contains 120
Arabic, English, and mixed-language scenarios and static n8n security checks.
Before production, also run the labeled set against the configured live model
and record task success, safety failures, input/output tokens, and latency.

## Database deployment

1. Take a Supabase database backup.
2. Apply migrations in numeric order through 037. Never apply the cutover
   migration without migrations 028–036.
3. Verify `ai_runtime_settings` contains one row with backend `inline`.
4. Verify the three pgmq queues exist and the automation tables/RPCs are
   present.
5. Confirm current application traffic still uses the inline compatibility
   path.
6. Verify merchant automation settings were backfilled and all workflow
   toggles/email delivery default to off.

The migrations are backward compatible during the stability window. Do not
drop `messages.ai_processed`, legacy merchant confidence/auto-clarify columns,
or the inline executor during this release.

## OCI deployment

1. Provision an OCI Always Free Ampere VM. Capacity and uptime are not
   guaranteed; the database/dashboard must remain useful when it is offline.
2. Permit public TCP 80/443. Restrict TCP 22 to an administrator IP/VPN,
   disable password/root SSH, and apply OS security updates.
3. Point production and staging Muin-controlled DNS names at the VM.
4. Install Docker Engine, Compose v2, `age`, `curl`, and `jq`.
5. Copy the repository/immutable release, create the two mode-0600 environment
   files, and validate `docker compose config --quiet`.
6. Start production containers:

   ```bash
   cd infra/n8n
   docker compose up -d --build
   docker compose ps
   ```

   The worker publishes heartbeats but does not claim work while the database
   switch is `inline`. All exported n8n workflows are inactive.

7. Start staging explicitly when needed:

   ```bash
   docker compose --profile staging up -d postgres-staging n8n-staging
   ```

8. Inspect health and recent logs:

   ```bash
   docker compose ps
   docker compose logs --since 15m traefik postgres n8n muin-worker
   ```

Never expose ports 5432 or 5678 directly. Traefik is the only public container.

## n8n import and workflow activation

n8n Community Edition has no native Git-backed environments. Promote reviewed
exports manually:

1. Import `n8n/workflows/*.json` into staging. Confirm all five are inactive.
2. Review every Code and HTTP Request node against the committed export.
3. Confirm staging resolves only the staging Muin URL/HMAC and Resend sender.
4. Run the schedule endpoint with `dry_run: true`, then claim against mock/test
   jobs. Test success, Resend 429/5xx, timeout, repeated request, and post-send
   crash/retry.
5. Confirm repeated schedule/claim/report delivery creates no duplicate flag,
   notification, job, or email.
6. Export staging again without credentials and diff it with the committed
   JSON. Resolve drift before production import.
7. Import into production while inactive.
8. Enable one workflow at a time in this order: new order, inventory, customer
   wait, stale order, daily summary.
9. Observe at least one complete schedule/claim/send/report cycle before
   enabling the next workflow.

Workflow enablement is independent of the AI runtime switch. Do not combine a
workflow activation and the AI cutover in one change window.

## AI cutover

The cutover helper calls service-role-only RPCs and prints no secret. It
requires `curl`, `jq`, `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), and
`SUPABASE_SERVICE_ROLE_KEY` in the operator environment.

Check readiness:

```bash
infra/n8n/scripts/cutover-ai.sh status
```

Expected before activation:

- `backend` is `inline`.
- `healthy_merchants` equals `merchants`.
- `stale_heartbeats` is zero.
- No unexplained `processing`, `retry_wait`, or `dead_letter` backlog.

Run production smoke fixtures while still inline: simple question, order with
variant/address, readback then explicit confirmation, human request, merchant
takeover/resume, and unavailable facts. Verify persisted outbound messages,
orders, flags, and `ai_decisions` metrics.

Perform the single cutover:

```bash
AI_CUTOVER_CONFIRM=queue \
  infra/n8n/scripts/cutover-ai.sh queue "production cutover YYYY-MM-DD operator"
```

The database function rechecks heartbeat coverage inside the same transaction.
After switching, send a controlled message and verify:

1. Webhook returns promptly and the message becomes `queued`.
2. Worker claims it, records `processing`, and publishes a heartbeat.
3. Exactly one outbound message is persisted and sent.
4. Input/output tokens, latency, model/provider, prompt/context version,
   attempts, finish reason, and reply outcome appear in `ai_decisions`.
5. A burst marks predecessor queue items `superseded`.
6. A human takeover suppresses AI and delayed acknowledgement.

## Rollback and reconciliation

Rollback does not require a code deployment:

```bash
AI_CUTOVER_CONFIRM=inline \
  infra/n8n/scripts/cutover-ai.sh inline "rollback YYYY-MM-DD reason"
```

The worker observes `inline` and stops claiming new jobs. Active jobs are
allowed to finish. Then:

1. Confirm the status RPC reports `inline`.
2. Optionally stop the worker only after active processing reaches zero:
   `docker compose stop muin-worker`.
3. Inspect messages in `queued`, `processing`, `retry_wait`, and `dead_letter`.
4. Do not delete queued messages. Compare each ID with `ai_processed`, outbound
   idempotency keys, conversation mode, and the latest inbound owner.
5. Mark/requeue only through reviewed service-role queue functions. Never copy
   message bodies into manual queue payloads.
6. Verify the inline executor handles new traffic and no duplicate reply/order
   appears.

Leave n8n enabled during an AI rollback unless an automation-specific failure
exists; it is outside the customer conversation path.

## Monitoring and alerts

Dashboard/runtime checks:

- `ai_queue_health`: heartbeat age, status, depth, oldest message age.
- `messages.ai_processing_status`: queued/processing/retry/dead-letter trends.
- `ai_decisions`: task success proxy, token distribution, latency, provider
  errors, retries, finish reasons, reply outcomes, prompt/context versions.
- `automation_jobs`: queued/claimed/failed/deferred age and attempts.
- `automation_workflow_errors`: repeated workflow/error class.
- `automation_email_usage`: daily quota pressure.
- `merchant_notifications` and open flags: delivery remains visible without
  email.

Recommended initial alarms:

- Worker heartbeat older than 60 seconds.
- Oldest queued AI message older than two minutes.
- Any AI dead-letter item.
- Provider error/retry spike above the characterization baseline.
- Handoff or customer-wait volume materially above baseline.
- Claimed automation lease expired or repeated workflow failure.
- Resend daily quota near the configured ceiling.
- Backup job missed or off-host copy older than 24 hours.

Do not log full prompts, customer transcripts, service-role keys, HMAC secrets,
channel credentials, or prepared email bodies in general infrastructure logs.

## Backup and restore

Nightly cron should run `infra/n8n/scripts/backup.sh`. It exports credential-free
workflow JSON and encrypts both the n8n PostgreSQL dump and workflow archive to
the configured off-host `age` recipient. Copy `.age` artifacts off the VM and
monitor their age. Retention defaults to 14 days.

The n8n encryption key is required to use encrypted credentials after restore.
Back it up separately in the secret manager; it is intentionally not included
inside the database dump.

Perform a restore drill before activation and at least quarterly:

1. Create a new isolated/staging database and matching n8n encryption key.
2. Run `infra/n8n/scripts/restore.sh <encrypted-db-backup>` and type `RESTORE`.
3. Import/decrypt the workflow archive separately.
4. Start n8n with every workflow disabled.
5. Validate owner login, workflow count/version, credentials, HMAC test,
   Resend test delivery, execution pruning, and a mock schedule/job cycle.
6. Record recovery point and recovery time.

Supabase backups are operated separately through the Supabase project. The OCI
n8n backup is not a backup of Muin domain data or AI queues.

## Secret rotation

HMAC rotation without downtime:

1. Generate a new random key and ID.
2. Add old and new keys to application `MUIN_AUTOMATION_HMAC_KEYS`; deploy.
3. Update only staging and validate.
4. Update production n8n to sign with the new ID/secret and run one workflow.
5. Confirm requests with the new key succeed and replays/old timestamps fail.
6. Remove the old key from the application after the overlap window.

Rotate Resend keys/senders in staging first. Rotate the Supabase service-role
and Gemini keys only in `.env.worker` and application server environments; n8n
must not receive them. Preserve `N8N_ENCRYPTION_KEY` across ordinary upgrades;
changing it requires an explicit credential migration/re-entry plan.

## Model switch

1. Add the candidate behind `AIProvider`; do not change the reducer or context
   schema for provider-specific output.
2. Run the 120-case evaluation set plus production-derived redacted fixtures.
3. Require zero safety invariant failures, at least 95% task success, 100%
   human-request recall, and no more than a two-point loss from the incumbent.
4. Compare requested/effective settings, p50/p95 tokens, latency, retries,
   schema failure, handoff rate, and language quality.
5. Bump model configuration and prompt version only when their behavior/content
   changes; keep context/output schema versions independently explicit.
6. Deploy with the existing AI runtime backend unchanged and retain the prior
   model identifier for rapid configuration rollback.

## Stability window and cleanup

For 14 stable production days after cutover:

- Keep the inline executor compiled but inactive.
- Keep legacy confidence/auto-clarify columns for rollback compatibility.
- Review all dead letters, human takeovers, provider errors, duplicate signals,
  token regressions, and automation workflow failures daily.
- Do not weaken thresholds to hide failures.

After the window, open separate reviewed cleanup branches to remove the inline
executor and legacy controls. Cleanup is not part of the cutover release.
