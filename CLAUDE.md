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
npm run typecheck  # TypeScript type check (tsc --noEmit)
npm run start      # Start production server
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=   # Your deployment URL or ngrok URL for local dev
```

Bot tokens are stored per-merchant in `merchant_settings.telegram_bot_token`, not in env vars.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript strict mode |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Animations | Framer Motion (React state) + GSAP (timelines/scroll) |
| Database | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| AI | Google Gemini 2.5 Flash |
| Automation | n8n Cloud |
| Messaging | Telegram Bot API (MVP), WhatsApp (Phase 2) |
| Deployment | Vercel (frontend) + Supabase Cloud |

## Architecture

Three-layer system: **Next.js frontend** → **Next.js API routes** → **Supabase + n8n + Gemini**

Critical message flow: Customer sends Telegram message → webhook at `/api/webhooks/telegram/[merchantId]` → find/create customer + conversation → save message → Supabase Realtime push → Dashboard updates live

**Key architectural rules:**
- The app NEVER calls Telegram/WhatsApp APIs directly — always through the `MessagingProvider` interface in `src/lib/messaging/`
- Gemini is called ONLY after RegEx pre-filter detects an order signal (cost control)
- All sensitive operations (inventory math, status transitions, Gemini calls, bot tokens) run server-side in `src/app/api/` routes
- Server Components for initial page loads; Client Components for realtime/animations
- Webhook routes use `createAdminClient()` (no user session) — all others use `createClient()` with RLS

**Route groups:**
- `src/app/page.tsx` — landing page (root route, no auth required)
- `src/app/(public)/` — login, signup (no auth required)
- `src/app/(app)/` — dashboard, orders, conversations, inventory, flags, settings (auth required)
- `src/app/api/` — API routes for webhooks, orders, products, messages, AI processing

**Public API paths (exempt from auth middleware):**
- `/api/auth/` — OAuth callback
- `/api/waitlist` — landing page signup
- `/api/webhooks/` — Telegram webhook receiver (no user session, uses secret token verification)

## Git Workflow

### Branch naming
Always create a branch before starting any feature or fix:
```bash
git checkout -b feature/phase-4-ai-pipeline
git checkout -b fix/webhook-idempotency
git checkout -b chore/update-dependencies
```

Allowed prefixes: `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `hotfix/`

### Commit format (enforced by commitlint)
```
feat(scope): description       ← new feature
fix(scope): description        ← bug fix
chore: description             ← deps, config, maintenance
docs: description              ← documentation only
refactor(scope): description   ← code cleanup
```

Rules: lowercase subject, no period at end, max 72 chars. Scope is optional.

### Automated hooks (Husky)
- **pre-commit** — lint-staged runs ESLint + `tsc --noEmit` on staged TS files
- **commit-msg** — commitlint validates conventional commit format
- **pre-push** — enforces branch naming convention

### CI (GitHub Actions)
Every PR and push to `main` runs: lint → typecheck → build. All must pass.

## Design System Rules

- **Dark mode default** — black (`#0A0A0A`) base; light theme also available. Theme managed by `ThemeProvider` in `src/components/theme-provider.tsx`, persisted to `localStorage`
- **Color = meaning** — each color maps to a specific concept:
  - Blue: incoming orders/messages, Amber: pending, Green: confirmed, Violet: in delivery, Teal: delivered
  - Red: critical flags, Amber: medium, Gray: low
  - **Violet (`#7C3AED`) is exclusively for AI-generated content** — never use it decoratively
- **Fonts:** DM Sans (Latin), Noto Naskh Arabic (Arabic text), JetBrains Mono (order IDs, prices, timestamps)
- **Framer Motion** for React state animations (page transitions 0.3s, card stagger, KPI counts)
- **GSAP** for landing page sequences (chaos→clarity hero) and scroll-triggered reveals
- Mobile-first responsive design
- Use Tailwind classes: `text-status-incoming`, `text-ai`, `text-priority-critical`, `font-mono` for data, `font-arabic` for Arabic text
- CSS logical properties for RTL support (`margin-inline-start` not `margin-left`, `ps-` not `pl-`)

## Database

Multi-tenant via shared PostgreSQL with Row Level Security (RLS). Every table has `merchant_id` — always filter by it. RLS is enforced at the database level as a security guarantee, not just app convention.

Core tables: `merchants`, `merchant_settings`, `customers`, `conversations`, `messages`, `products`, `orders`, `order_items`, `order_timeline`, `flags`, `stock_adjustments`

`merchant_settings` key columns: `telegram_bot_token`, `telegram_connected`, `telegram_bot_username`, `telegram_webhook_secret`, `ai_confidence_threshold`, `ai_auto_clarify`, `low_stock_threshold`

## Key Principles

- TypeScript strict mode — no `any` types
- All data queries must filter by `merchant_id` (RLS)
- AI suggests, merchant decides — confidence thresholds determine auto-create vs. flag for human
- Messages are never lost — always saved to Supabase before any processing
- CSS logical properties for RTL support
- Webhook handlers always return 200 OK to Telegram (wrap in try/catch to prevent retry storms)
- Idempotency via `platform_message_id` — check before inserting any inbound message

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Project Setup | ✅ Complete | Next.js 16, TypeScript, Tailwind v4, Supabase, Framer Motion, GSAP |
| 0.5 — Landing Page | ✅ Complete | GSAP animations, all sections, chaos→clarity hero |
| 1 — Foundation | ✅ Complete | Auth, DB schema, app shell, onboarding, page shells |
| 2 — Catalog & Inventory | ✅ Complete | Product CRUD, image upload, inventory page, stock adjustments, dashboard alerts |
| 3 — Telegram Integration | ✅ Complete | Bot connection, webhook receiver, real-time conversations, send/receive messages |
| 4 — AI Pipeline | ⬜ Not started | |
| 5 — Order Management | ⬜ Not started | |
| 6 — Automation (n8n) | ⬜ Not started | |

## Phase 1 — What Was Built

**Auth:**
- `src/middleware.ts` — protects all `(app)` routes, redirects to `/onboarding` if merchant profile missing
- `src/lib/supabase/middleware.ts` — middleware-specific Supabase client (uses NextRequest/NextResponse cookies)
- `src/app/api/auth/callback/route.ts` — OAuth code exchange handler
- `src/app/(public)/login/page.tsx` — Google, email/password, phone OTP
- `src/app/(public)/signup/page.tsx` — same methods + email confirmation state

**Database:**
- `supabase/migrations/001_initial_schema.sql` — all 11 tables, RLS, indexes, triggers
- `src/lib/supabase/admin.ts` — service role client (server-only, bypasses RLS)

**Onboarding:**
- `src/app/(app)/onboarding/page.tsx` + `actions.ts` — creates merchant + merchant_settings rows
- `src/components/onboarding/business-basics-form.tsx` — name, type, city, phone

**App Shell:**
- `src/app/(app)/layout.tsx` — fetches merchant server-side, wraps in MerchantProvider
- `src/components/layout/sidebar.tsx` — desktop nav (240px), icon-only on tablet, hidden on mobile
- `src/components/layout/top-bar.tsx` — business name, notification bell, profile dropdown
- `src/components/layout/mobile-nav.tsx` — fixed bottom nav for mobile
- `src/components/layout/merchant-provider.tsx` — React context; use `useMerchant()` hook in client components
- `src/components/layout/page-transition.tsx` — Framer Motion wrapper (opacity + y, 0.3s)

**Pages:** All shells wrapped in `<PageTransition>`: dashboard (KPI cards), orders, inventory, flags, settings

**Waitlist:**
- `src/app/api/waitlist/route.ts` — POST endpoint, uses admin client
- `src/components/landing/footer-cta-section.tsx` — email form added

## Phase 2 — What Was Built

**Database Migrations:**
- `supabase/migrations/002_product_images_storage.sql` — Supabase Storage bucket for product images (public, 5MB, RLS)
- `supabase/migrations/003_stock_adjustments.sql` — `stock_adjustments` table for audit logging manual +/- changes

**Types & Validation:**
- `src/types/product.ts` — `Product`, `ProductVariant`, `StockAdjustment`, `StockStatus` types
- `src/lib/validations/product.ts` — Zod schemas: `createProductSchema`, `updateProductSchema`, `stockAdjustmentSchema`
- `src/lib/utils/inventory.ts` — helpers: `getStockStatus()`, `getAvailableQuantity()`, `formatPrice()`, `getStockBarPercentage()`, etc.

**API Routes:**
- `src/app/api/products/route.ts` — GET (list merchant products) + POST (create product)
- `src/app/api/products/[id]/route.ts` — GET (single), PATCH (update), DELETE (soft delete via `is_active = false`)
- `src/app/api/products/[id]/adjust/route.ts` — POST (stock adjustment with reason logging)

**Inventory Components** (`src/components/inventory/`):
- `product-form.tsx` — Sheet slide-over for add/edit with image upload to Supabase Storage, alt names tag input, variants, Zod validation
- `inventory-content.tsx` — client wrapper managing search, filter, sort, view state
- `inventory-toolbar.tsx` — search, status filter (all/in stock/low/out), sort, grid/list toggle, add button
- `product-grid.tsx` — responsive card grid with Framer Motion stagger animation
- `product-card.tsx` — product card with image, price, stock bar, status badge, quantities
- `product-table.tsx` — table view with all columns
- `stock-bar.tsx` — horizontal bar (green/amber/red) based on stock health
- `product-detail.tsx` — full detail page with edit, deactivate, stock adjustment +/-
- `stock-adjustment-dialog.tsx` — Dialog for manual stock +/- with reason and preview

**Dashboard:**
- `src/components/dashboard/inventory-alerts.tsx` — out of stock (red) + low stock (amber) alerts, clickable to product detail

**Pages:**
- `src/app/(app)/inventory/page.tsx` — server component fetching products + merchant settings, renders `InventoryContent`
- `src/app/(app)/inventory/[id]/page.tsx` — server component fetching product + adjustments, renders `ProductDetail`
- `src/app/(app)/dashboard/page.tsx` — server component with inventory alerts integration

**Key patterns established in Phase 2:**
- Product form uses client-side state + `fetch` to API routes (not server actions) for interactive image upload
- Image upload goes directly from browser to Supabase Storage, API only receives the public URL
- Client-side filtering/sorting for MVP (all products fetched at once)
- Soft delete (`is_active = false`) to preserve `order_items` references
- Stock adjustments create audit trail in `stock_adjustments` table
- Base-ui Select `onValueChange` passes `string | null` — always guard with `(v) => v && handler(v)`

## Phase 3 — What Was Built

**Database Migration:**
- `supabase/migrations/004_telegram_webhook.sql` — adds `telegram_bot_username`, `telegram_webhook_secret` to `merchant_settings`; indexes on `conversations(merchant_id, last_message_at DESC)` and `messages(platform_message_id)`

**Types & Validation:**
- `src/types/telegram.ts` — `TelegramUpdate`, `TelegramMessage`, `TelegramUser`, `TelegramChat`, `TelegramBotInfo` types
- `src/lib/validations/telegram.ts` — `connectTelegramSchema` (token regex), `sendMessageSchema`
- `src/types/merchant.ts` — extended with `telegram_bot_username`, `telegram_webhook_secret` fields

**Messaging Layer:**
- `src/lib/messaging/interface.ts` — `MessagingProvider` interface (already existed), `ParsedMessage`, `MessageResult` types
- `src/lib/messaging/telegram.ts` — `TelegramProvider` class implementing `MessagingProvider`; static helpers: `verifyToken()`, `setWebhook()`, `deleteWebhook()`

**API Routes:**
- `src/app/api/telegram/connect/route.ts` — POST (verify token, register webhook, save to DB) + DELETE (remove webhook, clear token)
- `src/app/api/webhooks/telegram/[merchantId]/route.ts` — POST webhook receiver: secret verification, idempotency check, find/create customer+conversation, save message, update conversation metadata
- `src/app/api/messages/route.ts` — GET messages for a conversation (resets unread count)
- `src/app/api/messages/send/route.ts` — POST send merchant reply via Telegram + save to DB

**Realtime Hooks:**
- `src/hooks/use-realtime-conversations.ts` — Supabase Realtime subscription on `conversations` table
- `src/hooks/use-realtime-messages.ts` — Supabase Realtime subscription on `messages` table

**Chat Components** (`src/components/chat/`):
- `message-bubble.tsx` — styled by sender type (customer=blue, merchant=gray, AI=violet, system=centered)
- `chat-thread.tsx` — scrollable message list with date separators, auto-scroll, realtime updates
- `reply-input.tsx` — auto-growing textarea, Enter to send, POSTs to `/api/messages/send`

**Conversations Components** (`src/components/conversations/`):
- `conversation-list.tsx` — searchable list sorted by `last_message_at`, unread badge, customer initials avatar
- `conversations-content.tsx` — two-panel layout (list + chat), mobile toggle, realtime conversation updates

**Settings Components:**
- `src/components/settings/telegram-connection.tsx` — bot connection form with BotFather instructions, token input, connected state with disconnect option

**Dashboard:**
- `src/components/dashboard/telegram-prompt.tsx` — dismissible banner shown when `telegram_connected = false`

**Pages:**
- `src/app/(app)/conversations/page.tsx` — server component fetching conversations with customer names
- `src/app/(app)/settings/page.tsx` — updated with `TelegramConnection` component (fetches telegram status on mount)
- `src/app/(app)/dashboard/page.tsx` — updated with `TelegramPrompt` banner

**Navigation:**
- `src/components/layout/sidebar.tsx` — added Messages (`/conversations`) nav item
- `src/components/layout/mobile-nav.tsx` — added Messages nav item

**Key patterns established in Phase 3:**
- Webhook URL includes `merchantId` in path — no token scanning per request
- Webhook secret (`x-telegram-bot-api-secret-token` header) verified on every inbound request
- Idempotency via `platform_message_id` — checked before inserting any message
- Always return 200 OK to Telegram regardless of processing errors (prevent retry storms)
- Settings page stays as client component, fetches telegram status on mount via `supabase.from('merchant_settings')`
- `ConversationWithCustomer` type extends `Conversation` with joined `customers` data

## shadcn/ui Note

This project uses **base-ui** backed shadcn components (not Radix). Key differences:
- `DropdownMenuTrigger`, `TooltipTrigger`, `SheetTrigger`, `DialogTrigger` do NOT support `asChild` prop
- Put content directly inside the trigger element, or wrap with a plain `<a>` or `<Link>` outside the Button
- Zod v4 uses `.issues` not `.errors` on `ZodError`
- Select `onValueChange` passes `string | null` — always null-guard: `(v) => v && handler(v)`

**Installed components:** button, input, label, card, separator, select, avatar, dropdown-menu, tooltip, dialog, sheet, table, badge, textarea, tabs, skeleton, switch

## Manual Setup Required After Each Phase

Always check after implementation:
1. **SQL migrations** — run new files in Supabase SQL Editor
2. **Env vars** — add new values to `.env.local`
3. **Supabase settings** — enable providers, Storage buckets, Realtime, Webhooks as needed

**Phase 3 setup checklist:**
- Run `supabase/migrations/004_telegram_webhook.sql` in Supabase SQL Editor
- Add `NEXT_PUBLIC_APP_URL` to `.env.local` (ngrok URL for local dev, Vercel URL for prod)
- Enable Supabase Realtime for `conversations` and `messages` tables (Dashboard → Database → Replication)
- For local dev: run `ngrok http 3000` and use the ngrok URL as `NEXT_PUBLIC_APP_URL`
