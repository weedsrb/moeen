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

Critical message flow: Customer sends Telegram message → n8n webhook → RegEx pre-filter → (if order signal) Gemini extraction → Supabase write → Realtime push → Dashboard update

**Key architectural rules:**
- The app NEVER calls Telegram/WhatsApp APIs directly — always through the `MessagingProvider` interface in `src/lib/messaging/`
- Gemini is called ONLY after RegEx pre-filter detects an order signal (cost control)
- All sensitive operations (inventory math, status transitions, Gemini calls) run server-side in `src/app/api/` routes
- Server Components for initial page loads; Client Components for realtime/animations

**Route groups:**
- `src/app/page.tsx` — landing page (root route, no auth required)
- `src/app/(public)/` — login, signup (no auth required)
- `src/app/(app)/` — dashboard, orders, inventory, flags, settings (auth required)
- `src/app/api/` — API routes for webhooks, orders, products, AI processing

## Design System Rules

- **Dark mode default** — black (`#0A0A0A`) base; light theme also available. Theme managed by `ThemeProvider` in `src/components/theme-provider.tsx`, persisted to `localStorage`
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

Core tables: `merchants`, `merchant_settings`, `customers`, `conversations`, `messages`, `products`, `orders`, `order_items`, `order_timeline`, `flags`, `stock_adjustments`

## Key Principles

- TypeScript strict mode — no `any` types
- All data queries must filter by `merchant_id` (RLS)
- AI suggests, merchant decides — confidence thresholds determine auto-create vs. flag for human
- Messages are never lost — always saved to Supabase before any processing
- CSS logical properties for RTL support (`margin-inline-start` not `margin-left`)

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Project Setup | ✅ Complete | Next.js 16, TypeScript, Tailwind v4, Supabase, Framer Motion, GSAP |
| 0.5 — Landing Page | ✅ Complete | GSAP animations, all sections, chaos→clarity hero |
| 1 — Foundation | ✅ Complete | Auth, DB schema, app shell, onboarding, page shells |
| 2 — Catalog & Inventory | ✅ Complete | Product CRUD, image upload, inventory page, stock adjustments, dashboard alerts |
| 3 — Telegram Integration | ⬜ Not started | |
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

**Pages (updated from shells to full implementations):**
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

## shadcn/ui Note

This project uses **base-ui** backed shadcn components (not Radix). Key differences:
- `DropdownMenuTrigger`, `TooltipTrigger`, `SheetTrigger`, `DialogTrigger` do NOT support `asChild` prop
- Put content directly inside the trigger element
- Zod v4 uses `.issues` not `.errors` on `ZodError`
- Select `onValueChange` passes `string | null` — always null-guard: `(v) => v && handler(v)`

**Installed components:** button, input, label, card, separator, select, avatar, dropdown-menu, tooltip, dialog, sheet, table, badge, textarea, tabs, skeleton, switch

## Manual Setup Required After Each Phase

Always check after implementation:
1. **SQL migrations** — run new files in Supabase SQL Editor
2. **Env vars** — add new values to `.env.local`
3. **Supabase settings** — enable providers, Storage buckets, Realtime, Webhooks as needed

**Phase 2 pending setup:**
- Run `supabase/migrations/002_product_images_storage.sql` in Supabase SQL Editor
- Run `supabase/migrations/003_stock_adjustments.sql` in Supabase SQL Editor
- Verify `product-images` bucket exists in Supabase Dashboard → Storage
