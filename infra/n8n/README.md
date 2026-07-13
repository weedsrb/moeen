# Muin n8n on OCI Always Free

This stack runs regular-mode n8n, a dedicated PostgreSQL database, Traefik,
and the Muin AI worker. It intentionally does not run Redis or n8n queue mode.
n8n handles merchant operations only; the worker remains the customer AI path.

## Host setup

1. Create an OCI Always Free Ampere VM with Ubuntu. Capacity is not guaranteed;
   keep encrypted off-host backups and a tested restore path.
2. In the OCI network security list and the VM firewall, allow TCP 80/443 from
   the internet. Allow TCP 22 only from an administrator IP or VPN.
3. Point the selected Muin-controlled subdomain to the VM public IP.
4. Install Docker Engine, the Compose plugin, and `age`. Add the deployment user
   to the docker group; disable password SSH and root login.
5. Copy `.env.example` to `.env` and `.env.worker.example` to `.env.worker`.
   Generate independent production and staging database, encryption, Muin HMAC,
   and Resend values. Set both files to mode `0600`. Never put Supabase,
   Gemini, Resend, HMAC, or n8n secrets in Git.
6. Start production with `docker compose up -d --build`. The staging services
   remain disabled unless explicitly started with
   `docker compose --profile staging up -d`.

## Workflow promotion

Community Edition has no native Git environments. Export workflows without
credentials to `n8n/workflows`, review the JSON, import them into the disabled
staging instance, run fixtures, then import into production. Credentials are
created separately in each n8n instance and are never exported to this repo.
Staging also uses a separate Muin deployment/HMAC key and Resend test key/sender;
the Compose profile does not inherit production automation credentials.

## Operations

- Run `scripts/backup.sh` nightly from cron and copy `.age` files off the VM.
- Perform a restore drill with `scripts/restore.sh` before enabling workflows.
- Review image pins monthly. Upgrade staging first and back up before changing a
  tag. Production currently pins n8n 2.29.10, PostgreSQL 16.10, and Traefik 3.5.4.
- Execution data is pruned after seven days by default. Successful executions
  are not retained; failures are retained until pruning.
- Use `docker compose ps` and `docker compose logs --since 15m SERVICE` for
  health checks. The application dashboard shows worker heartbeat/queue state.
- Keep all workflows disabled at first. Enable one workflow only after its dry
  run and HMAC replay/idempotency tests pass.
- Use `scripts/cutover-ai.sh status` to inspect readiness. Queue activation and
  rollback require an explicit `AI_CUTOVER_CONFIRM=queue|inline` value and are
  refused if worker heartbeat coverage is incomplete.

The n8n container receives only Muin HMAC and Resend environment credentials.
It never receives the Supabase service-role key, Instagram credentials, or
direct order-mutation access. See `../../docs/10_AI_AUTOMATION_OPERATIONS.md`
for the complete deployment and recovery runbook.
