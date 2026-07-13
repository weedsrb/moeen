# Mo'een — معين

Mo'een is an Instagram-first order and conversation workspace for Palestinian and MENA small businesses. It turns natural Arabic, English, and mixed-language customer messages into validated order drafts while keeping the merchant in control.

## Current capabilities

- Instagram connection, inbound webhooks, durable message storage, media re-hosting, and merchant replies.
- Multi-business accounts with isolated customers, catalogs, conversations, settings, and orders.
- Catalog CRUD, spreadsheet import, stock tracking, and low-stock views.
- Conversational Gemini order collection with burst coalescing, deterministic catalog/stock validation, explicit readback confirmation, flags, and an immutable AI decision audit trail.
- Realtime dashboard, conversations, order lifecycle, flags, and inventory updates.

## Runtime architecture

Today, the Instagram webhook stores each message and schedules `processInboundMessage` with Next.js `after()`. The AI pipeline lives in `src/lib/ai/`: it assembles recent context, runs an intent gate and Gemini, validates the returned extraction, updates a single `collecting` order, and sends one reply through the messaging abstraction.

The next architecture keeps customer conversation processing in Muin but moves it to a durable Supabase-backed worker. Self-hosted n8n is reserved for merchant-facing schedules and notifications; it will not own prompts, order state, Instagram credentials, or customer replies. See `docs/03_ARCHITECTURE.md`, `docs/06_N8N_WORKFLOWS.md`, and `docs/07_AI_PIPELINE.md`.

## Stack

| Layer | Technology |
|---|---|
| Web application | Next.js 16 App Router, React 19, strict TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, Base UI |
| Data | Supabase PostgreSQL, Auth, Realtime, Storage |
| AI | Gemini 2.5 Flash through a server-side pipeline |
| Messaging | Provider abstraction; Instagram is the active provider |
| Hosting | Vercel and Supabase Cloud |
| Planned automation | Self-hosted n8n Community Edition plus a dedicated Muin worker |

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

- `docs/03_ARCHITECTURE.md` — deployed architecture and target boundaries.
- `docs/04_DATABASE_SCHEMA.md` — database reference.
- `docs/06_N8N_WORKFLOWS.md` — approved n8n responsibilities and workflow backlog.
- `docs/07_AI_PIPELINE.md` — current in-process AI implementation.
- `docs/09_INSTAGRAM.md` — Instagram integration details.

## License

Private — all rights reserved.
