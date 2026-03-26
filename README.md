# Mo'een — معين

> "The one who helps" — an order management platform for Palestinian and MENA small businesses.

Mo'een intercepts customer messages on Telegram (and soon WhatsApp), uses AI to extract structured orders, and presents them in a clean merchant dashboard.

## What It Does

- Customer sends a message to your Telegram bot: *"بدي 3 كنافة"*
- Mo'een captures it, detects the order intent, and extracts structured data via Gemini AI
- The merchant sees a clean dashboard with order details, customer info, and conversation history
- No spreadsheets, no missed messages, no chaos

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui (base-ui) |
| Animations | Framer Motion + GSAP |
| Database | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| AI | Google Gemini 2.5 Flash |
| Automation | n8n Cloud |
| Messaging | Telegram Bot API (MVP), WhatsApp (Phase 2) |
| Deployment | Vercel + Supabase Cloud |

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/weedsrb/moeen.git
cd moeen
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=        # From Supabase project settings
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # From Supabase project settings
SUPABASE_SERVICE_ROLE_KEY=       # From Supabase project settings
GEMINI_API_KEY=                  # From Google AI Studio
NEXT_PUBLIC_APP_URL=             # Your deployment URL (or ngrok URL for local dev)
```

### 3. Database setup

Run the SQL migrations **in order** in your Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_product_images_storage.sql
supabase/migrations/003_stock_adjustments.sql
supabase/migrations/004_telegram_webhook.sql
```

### 4. Supabase setup

- **Auth**: Enable Email, Google OAuth, and Phone OTP providers
- **Storage**: Verify the `product-images` bucket exists (created by migration 002)
- **Realtime**: Enable for `conversations` and `messages` tables (Dashboard → Database → Replication)

### 5. Run locally

```bash
npm run dev
```

## Commands

```bash
npm run dev       # Dev server (Turbopack)
npm run build     # Production build
npm run lint      # ESLint check
npm run start     # Production server
```

## Architecture

Three-layer system: **Next.js frontend** → **Next.js API routes** → **Supabase + n8n + Gemini**

**Critical message flow:**
```
Customer Telegram message
  → Telegram Bot API webhook
  → /api/webhooks/telegram/[merchantId]
  → Find/create customer + conversation
  → Save message to Supabase
  → Supabase Realtime push
  → Dashboard updates live
```

**Key rules:**
- The app never calls Telegram/WhatsApp APIs directly — always through `MessagingProvider` (`src/lib/messaging/`)
- Gemini is called only after a RegEx pre-filter detects an order signal (cost control)
- All sensitive operations run server-side in `src/app/api/` routes
- Multi-tenant via Row Level Security — every table has `merchant_id`, RLS enforced at DB level
- Messages are never lost — always saved to Supabase before any processing

**Route groups:**
- `src/app/page.tsx` — landing page (no auth)
- `src/app/(public)/` — login, signup
- `src/app/(app)/` — dashboard, orders, conversations, inventory, flags, settings (auth required)
- `src/app/api/` — API routes for webhooks, orders, products, messages, AI

## Connecting Your Telegram Bot

1. Open Telegram → search `@BotFather` → send `/newbot`
2. Follow the prompts and copy the bot token
3. Go to **Settings** in your Mo'een dashboard → paste the token → click **Connect**
4. Mo'een automatically registers the webhook — messages will start appearing in real-time

For local development, use [ngrok](https://ngrok.com) to expose localhost:

```bash
ngrok http 3000
# Set NEXT_PUBLIC_APP_URL=https://your-subdomain.ngrok-free.app in .env.local
```

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| 0 — Project Setup | ✅ Complete | Next.js 16, TypeScript, Tailwind v4, Supabase, Framer Motion, GSAP |
| 0.5 — Landing Page | ✅ Complete | GSAP animations, chaos→clarity hero, all sections |
| 1 — Foundation | ✅ Complete | Auth (Google/email/OTP), DB schema (11 tables + RLS), app shell, onboarding |
| 2 — Catalog & Inventory | ✅ Complete | Product CRUD, image upload, inventory page, stock adjustments, dashboard alerts |
| 3 — Telegram Integration | ✅ Complete | Bot connection, webhook receiver, real-time conversations, send/receive messages |
| 4 — AI Pipeline | 🔜 Next | Gemini 2.5 Flash order extraction, RegEx pre-filter, confidence thresholds |
| 5 — Order Management | 🔜 Planned | Order CRUD, status workflow, order detail with chat context |
| 6 — Automation (n8n) | 🔜 Planned | Full workflow automation, quiet hours, notification preferences |

## License

Private — all rights reserved.
