# Mo'een — معين

Mo'een is an Instagram-first order and conversation workspace for Palestinian and MENA small businesses. It turns natural Arabic, English, and mixed-language customer messages into validated order drafts while keeping the merchant in control.

## Current capabilities

- Instagram connection, inbound webhooks, durable message storage, media re-hosting, and merchant replies.
- Multi-business accounts with isolated customers, catalogs, conversations, settings, and orders.
- Catalog CRUD, spreadsheet import, stock tracking, and low-stock views.
- Provider-neutral conversational order collection with compact context, deterministic catalog/stock/order validation, explicit prior-readback confirmation, human takeover, and privacy-conscious AI telemetry.
- Durable Supabase AI queues and a standalone Muin worker with leases, retries, dead-letter handling, heartbeats, and a runtime rollback switch.
- Realtime dashboard, notification center, conversations, order lifecycle, flags, inventory, and per-business AI/automation settings.
- Five inactive merchant-automation n8n exports plus an OCI Always Free Docker/Traefik/PostgreSQL deployment stack.

## Runtime architecture

The Instagram webhook persists each message, then uses a service-role-only runtime switch. `inline` retains the Next.js `after()` compatibility executor; `queue` sends only the message ID to Supabase Queues for `src/worker/index.ts`. Both paths share the compact-context, provider-neutral, deterministically validated pipeline in `src/lib/ai/`.

Self-hosted n8n is isolated to merchant schedules and prepared Resend email jobs. It does not own prompts, order state, Instagram credentials, customer replies, or Supabase access. Repository exports remain inactive until the operations runbook is executed. See `docs/03_ARCHITECTURE.md`, `docs/06_N8N_WORKFLOWS.md`, `docs/07_AI_PIPELINE.md`, and `docs/10_AI_AUTOMATION_OPERATIONS.md`.

## Stack

| Layer | Technology |
|---|---|
| Web application | Next.js 16 App Router, React 19, strict TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, Base UI |
| Data | Supabase PostgreSQL, Auth, Realtime, Storage |
| AI | `AIProvider` adapter; Gemini is the initial provider |
| Messaging | Provider abstraction; Instagram is the active provider |
| Hosting | Vercel and Supabase Cloud |
| Durable execution | Supabase Queues plus a dedicated TypeScript worker |
| Merchant automation | Self-hosted n8n Community Edition and Resend |

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required application variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=
```

Run every SQL file in `supabase/migrations/` in numeric order for a fresh database.

## Validation commands

```bash
npm run typecheck
npm run lint
npm test
npm run test:eval
npm run build
```

## Repository rules

- Read the relevant guides in `node_modules/next/dist/docs/` before changing Next.js routes or conventions; this repository uses Next.js 16.
- Persist inbound messages before triggering AI work.
- Keep tenant data scoped by `merchant_id` and enforce ownership at the database and API layers.
- Route provider communication through `src/lib/messaging/`.
- Treat model output as a proposal. Prices, totals, stock, variants, confirmation, and state transitions are decided by application code.
- Never place service-role, Gemini, Instagram, n8n, or email credentials in browser code or committed files.

## Documentation

- `docs/03_ARCHITECTURE.md` — current runtime topology and ownership boundaries.
- `docs/04_DATABASE_SCHEMA.md` — database reference.
- `docs/06_N8N_WORKFLOWS.md` — implemented n8n boundaries, workflows, and protected API.
- `docs/07_AI_PIPELINE.md` — current inline/worker AI flow, context, state, and provider contract.
- `docs/10_AI_AUTOMATION_OPERATIONS.md` — deployment, cutover, rollback, monitoring, backup, and recovery.
- `docs/09_INSTAGRAM.md` — Instagram integration details.

## License

Private — all rights reserved.
