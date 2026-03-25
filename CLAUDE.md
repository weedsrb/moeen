# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mo'een (معين — "the one who helps") is an order management SaaS platform for Palestinian/MENA small businesses. It intercepts customer messages on Telegram/WhatsApp, uses AI to extract structured orders, and presents them in a merchant dashboard.

## Documentation

Read these specs before making changes (in order):

1. `docs/01_PROJECT_VISION.md` — what Mo'een is and why
2. `docs/02_FEATURES.md` — every page and feature spec
3. `docs/03_ARCHITECTURE.md` — system design and file structure
4. `docs/04_DATABASE_SCHEMA.md` — all tables and relationships
5. `docs/05_DESIGN_SYSTEM.md` — colors, typography, animations
6. `docs/06_N8N_WORKFLOWS.md` — automation workflows
7. `docs/07_AI_PIPELINE.md` — Gemini integration spec
8. `docs/08_IMPLEMENTATION_GUIDE.md` — phased build plan

## Commands

```bash
npm run dev        # Start dev server (Turbopack)
npm run build      # Production build
npm run lint       # ESLint check
npm run start      # Start production server
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
TELEGRAM_BOT_TOKEN=  # Added in Phase 3
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), TypeScript strict mode |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Animations | Framer Motion (React state) + GSAP (timelines/scroll) |
| Database | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| AI | Google Gemini 2.5 Flash |
| Automation | n8n Cloud |
| Messaging | Telegram Bot API (MVP), WhatsApp (Phase 2) |
| Deployment | Vercel (frontend) + Supabase Cloud |

## Architecture

Three-layer system: **Next.js frontend** → **Next.js API routes** → **Supabase + n8n + Gemini**

Critical message flow: Customer sends Telegram message → n8n webhook → RegEx pre-filter → (if order signal) Gemini extraction → Supabase write → Realtime push → Dashboard update

**Key architectural rules:**
- The app NEVER calls Telegram/WhatsApp APIs directly — always through the `MessagingProvider` interface in `src/lib/messaging/`
- Gemini is called ONLY after RegEx pre-filter detects an order signal (cost control)
- All sensitive operations (inventory math, status transitions, Gemini calls) run server-side in `src/app/api/` routes
- Server Components for initial page loads; Client Components for realtime/animations

**Route groups:**
- `src/app/(public)/` — landing page, login, signup (no auth required)
- `src/app/(app)/` — dashboard, orders, inventory, flags, settings (auth required)
- `src/app/api/` — API routes for webhooks, orders, products, AI processing

## Design System Rules

- **Dark mode default** — black (`#0A0A0A`) base, set via `dark` class on `<html>`
- **Color = meaning** — each color maps to a specific concept:
  - Blue: incoming orders, Amber: pending, Green: confirmed, Violet: in delivery, Teal: delivered
  - Red: critical flags, Amber: medium, Gray: low
  - **Violet (`#7C3AED`) is exclusively for AI-generated content** — never use it decoratively
- **Fonts:** DM Sans (Latin), Noto Naskh Arabic (Arabic text), JetBrains Mono (order IDs, prices, timestamps)
- **Framer Motion** for React state animations (page transitions 0.3s, card stagger, KPI counts)
- **GSAP** for landing page sequences (chaos→clarity hero) and scroll-triggered reveals
- Mobile-first responsive design
- Use Tailwind classes: `text-status-incoming`, `text-ai`, `text-priority-critical`, `font-mono` for data, `font-arabic` for Arabic text

## Database

Multi-tenant via shared PostgreSQL with Row Level Security (RLS). Every table has `merchant_id` — always filter by it. RLS is enforced at the database level as a security guarantee, not just app convention.

Core tables: `merchants`, `merchant_settings`, `customers`, `conversations`, `messages`, `products`, `orders`, `order_items`, `order_timeline`, `flags`

## Key Principles

- TypeScript strict mode — no `any` types
- All data queries must filter by `merchant_id` (RLS)
- AI suggests, merchant decides — confidence thresholds determine auto-create vs. flag for human
- Messages are never lost — always saved to Supabase before any processing
- CSS logical properties for RTL support (`margin-inline-start` not `margin-left`)
