# Mo'een — Performance Audit Report

**Date:** 2026-04-16
**Branch:** `performance-rebuild` (branched from `main` at commit `53b00a5`)
**Reference branch (read-only):** `codex-performance-audit` — stashed WIP preserved in `stash@{0}`
**Next.js:** 16.2.1 (Turbopack)
**TypeScript strict mode:** enabled, `tsc --noEmit` passes cleanly on `main`.

---

## Section A — Baseline state

- Working copy has been reset to clean `main`. All ~40 files of prior in-flight work are safely held in `stash@{0}` and commits on the `codex-performance-audit` branch pointer.
- Phase 5 (order management) feature work is **dropped for now** per user decision; the UI routes for orders are stubs (`src/app/(app)/orders/page.tsx` is an empty-state placeholder).
- Dev server and a runaway `next-server` (225 % CPU) were stopped before the build.
- `npm run build` (production, Turbopack) succeeds. Turbopack reports a non-blocking deprecation warning:

  > `The "middleware" file convention is deprecated. Please use "proxy" instead.`

  This is the Next.js 16 `proxy.ts` rename; `src/middleware.ts` continues to work but the migration path is documented for Phase 1.

### Route inventory (from production build)
App routes (all dynamic `ƒ`): `/dashboard`, `/conversations`, `/orders`, `/orders/[id]`, `/inventory`, `/inventory/[id]`, `/flags`, `/settings`, `/onboarding`, `/login`, `/signup`.
Static routes: `/`, `/_not-found`.
API routes: `/api/ai/process`, `/api/auth/callback`, `/api/messages`, `/api/messages/send`, `/api/orders`, `/api/products`, `/api/products/[id]`, `/api/products/[id]/adjust`, `/api/settings/ai`, `/api/settings/ai/faq`, `/api/settings/ai/faq/[id]`, `/api/waitlist`, `/api/webhooks/whatsapp/[merchantId]`, `/api/whatsapp/connect`.

---

## Section B — Lighthouse baseline

**Could not be automated in this environment.** Lighthouse needs a running production server and a headless Chrome. Commands for the user to run locally:

```bash
# Terminal 1 — serve production build
npm run build && npm run start

# Terminal 2 — run Lighthouse against each route
npx lighthouse http://localhost:3000/          --view --preset=desktop --only-categories=performance
npx lighthouse http://localhost:3000/dashboard --view --preset=desktop --only-categories=performance
npx lighthouse http://localhost:3000/orders    --view --preset=desktop --only-categories=performance
npx lighthouse http://localhost:3000/inventory --view --preset=desktop --only-categories=performance
npx lighthouse http://localhost:3000/flags     --view --preset=desktop --only-categories=performance
```

Numbers to capture into the table below (to be filled by the user or at the end of Phase 5):

| Route | Performance | LCP | INP | CLS | TBT | Transferred JS |
|-------|-------------|-----|-----|-----|-----|----------------|
| `/` | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ |
| `/dashboard` | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ |
| `/orders` | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ |
| `/inventory` | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ |
| `/flags` | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ | _TBC_ |

Phase 5 will re-run these for an after-column.

---

## Section C — Bundle analyzer

**Attempted and blocked.** `@next/bundle-analyzer` is installed (`devDependencies` → v16.2.1) and wired in `next.config.ts` gated behind `ANALYZE=true`, but Turbopack emits:

> The Next Bundle Analyzer is not compatible with Turbopack builds, no report will be generated. Consider trying the new Turbopack analyzer via `next experimental-analyze`. To run this analysis pass the `--webpack` flag to `next build`.

`npx next experimental-analyze` exited with code 144 (terminated) in both foreground and background runs in this environment. Two viable paths for Phase 2:

1. **Preferred.** Run `next build --webpack` with `@next/bundle-analyzer` once Phase 2.3 (`optimizePackageImports`) is in place — Webpack is the canonical analyzer path and produces a detailed treemap.
2. **Alternative.** Use Chrome DevTools → Network + Coverage panel on a production `next start` to measure transferred JS per route.

### What we know without the analyzer
From `package.json` and route construction, the shared-chunk contributors are:

| Package | Version | Est. min+gz | Scope |
|---------|---------|-------------|-------|
| `next` | 16.2.1 | framework | all routes |
| `react` + `react-dom` | 19.2.4 | framework | all routes |
| `@supabase/ssr`, `@supabase/supabase-js` | 0.9 / 2.100 | ~30 KB | all `(app)` routes, all APIs |
| `@base-ui/react` | 1.3.0 | ~30-40 KB | all routes that use shadcn dialogs/menus |
| `lucide-react` | 1.6.0 | per-icon | all routes |
| `framer-motion` | 12.38.0 | ~30 KB | landing (`navbar`, but inert), `page-transition`, `product-grid` |
| `gsap` + `gsap/ScrollTrigger` | 3.14.2 | ~45 KB | landing only (5 files) |
| `@google/generative-ai` | 0.24.1 | ~25 KB | server-side only — should not ship to client |
| `zod` | 4.3.6 | ~15 KB | server forms + client forms |
| `tailwind-merge`, `clsx`, `class-variance-authority` | — | small | all |

**Expectations that the Phase 2 analyzer run should confirm:**
- GSAP + ScrollTrigger MUST appear only in the `/` chunk. If they appear in a shared chunk, that's a miscategorisation bug — the current static imports in the 5 landing files make this plausible.
- Framer Motion currently appears on any route that mounts `PageTransition` (every `(app)` route) because of its static import in `page-transition.tsx`. This is expected but wasteful.
- `@google/generative-ai` should not be in any client chunk. If it is, it means a client file imports from `@/lib/ai/*` — worth verifying in Phase 2.
- `lucide-react` should already be tree-shaken (individual icon imports are used) but `optimizePackageImports` improves this further.

---

## Section D — Render audit (Client/Server boundaries)

49 files carry `"use client"`. The large majority are correct (shadcn UI primitives, forms, realtime components, GSAP'd landing sections). Findings:

### Candidate: move to Server Component
| File | Why | Severity |
|------|-----|----------|
| `src/components/dashboard/inventory-alerts.tsx` | Marked `"use client"` but uses no hooks, events, or browser APIs — pure JSX over props (`Link`, lucide icons, helper funcs). Convert to Server Component to drop from the dashboard client bundle. | Medium |

### Client Component data fetching that could be server-side
| File | Pattern | Severity |
|------|---------|----------|
| `src/components/inventory/inventory-content.tsx:36-40` | After a create/edit, calls `fetch("/api/products")` to refresh the full list. This is reasonable for incremental refresh, but a better pattern is `router.refresh()` to let the Server Component re-render with fresh data. Also will break when Phase 4 adds cursor pagination. | Low |

### `"use client"` that IS correct (verified)
All 49 files reviewed. The remaining 48 legitimately need `"use client"` — either forms with `useState`, realtime subscribers, GSAP animators, shadcn primitives, or the theme provider.

### Layout-level concerns
| File | Issue | Severity |
|------|-------|----------|
| `src/app/(app)/layout.tsx:14-17` | Reads `headers().get("x-pathname")` only to detect `/onboarding`. This header isn't set anywhere in the codebase, so the check effectively always reads empty. The onboarding branch is dead code; the `!merchantData` branch handles the real case. Low impact but worth cleaning. | Low |
| `src/app/(app)/loading.tsx` | Single generic loader for the whole `(app)` segment. Individual routes have no `loading.tsx`, so the generic 5-card skeleton shows for orders/inventory/flags/conversations/settings even though their layouts differ. | High |

---

## Section E — Animation audit

### GSAP (5 files, all Client Components, all landing)
| File | Uses ScrollTrigger? | Animated properties | Cleanup | Issue |
|------|---------------------|---------------------|---------|-------|
| `src/components/landing/hero-section.tsx` | Yes | `opacity`, `scale`, `x`, `y`, `rotation` (GPU-safe) | `ctx.revert()` | Static GSAP import ships to landing chunk |
| `src/components/landing/problem-section.tsx` | Yes | `y`, `opacity` | `ctx.revert()` | Static GSAP import |
| `src/components/landing/solution-section.tsx` | Yes | `x`, `opacity` | `ctx.revert()` | Static GSAP import |
| `src/components/landing/how-it-works-section.tsx` | Yes | `y`, `opacity`, `scaleX` | `ctx.revert()` | Static GSAP import |
| `src/components/landing/section-wrapper.tsx` | Yes | `y`, `opacity` | `ctx.revert()` | Static GSAP import |

**All cleanups are correct** (`gsap.context()` + `ctx.revert()` in effect cleanup). **All animated properties are GPU-friendly** (no `width/height/top/left/margin/padding`). **`useReducedMotion()` is honoured everywhere.** The only issue is that GSAP (~45 KB) is in the landing chunk eagerly — dynamic import is the fix.

### Framer Motion (3 files)
| File | Usage | Animated properties | Concern |
|------|-------|---------------------|---------|
| `src/components/layout/page-transition.tsx:13-18` | Wraps every `(app)` page | `opacity` | Framer Motion is overkill for a 150 ms fade; CSS animation is cheaper and ships 0 KB of library code for this case. |
| `src/components/inventory/product-grid.tsx:16-21` | Per-card entry animation | `opacity`, `y` | GPU-safe; staggered by `index * 0.05s`. OK, but can be CSS-only for better perf. |
| `src/components/landing/navbar.tsx:23-44` | `motion.nav` wrapper | None animated (relies on CSS class transitions) | Inert usage — the motion.nav bundles Framer Motion on `/` unnecessarily. Pure `<nav>` with the same classes is identical visually. |

### Framer Motion property scan
Grep over `animate=`, `initial=`, `exit=`, `transition=` and `variants=` — **no layout-triggering properties** (`width`, `height`, `top`, `left`, `right`, `bottom`, `margin`, `padding`) animated anywhere on `main`. Good.

### Page transition details
`PageTransition` wraps every `(app)` page with a motion.div that animates `opacity: 0 → 1` over 150 ms. Three issues:
1. Forces Framer Motion into every app route's client bundle.
2. Creates a new client-component boundary at the top of every page, which means every page is a Client Component child of a Server Component — partial-prerender aside, this is suboptimal.
3. A CSS `@keyframes` fade animation achieves the same UX at zero JS cost.

---

## Section F — Catalogue of work on `codex-performance-audit`

Full KEEP / MODIFY / DISCARD table. Items marked KEEP will be re-implemented cleanly in Phases 1–4 on `performance-rebuild`.

### KEEP (apply fresh in named phase)

| Change (on codex branch) | Why it's worth keeping | Target phase |
|--------------------------|------------------------|--------------|
| Delete `src/middleware.ts`; per-page `auth.getUser()` + `redirect('/login')` | Eliminates a middleware hop for every request. Also aligns with Next.js 16 deprecation warning — migrate to `proxy.ts` if any auth hook is still needed. | Phase 1.8 |
| New `src/app/api/auth/signout/route.ts` called by sign-out buttons | Keeps sign-out server-side (cookie cleanup), replacing browser-side `supabase.auth.signOut()`. | Phase 1.8 |
| `next.config.ts` → add `cacheComponents: true` and `experimental.staleTimes: { dynamic: 30, static: 300 }` | Enables PPR-like Server Component caching and sane stale windows. | Phase 1 |
| `next.config.ts` → `images.remotePatterns` allowlist for Supabase Storage | Unlocks Next.js `<Image>` for product images. | Phase 1 |
| `src/lib/supabase/client.ts` → lazy singleton `browserClient ??= createBrowserClient(...)` | Prevents a new Supabase client instance per render / per component. | Phase 1.7 |
| Column-narrowed queries via `PRODUCT_COLUMNS`, `MESSAGE_COLUMNS`, `CONVERSATION_COLUMNS` constants | Consistent, less data, easier to audit. | Phase 1.5 |
| `dashboard_metrics(p_merchant_id uuid)` RPC replacing 10 parallel count queries on dashboard | Single round trip instead of 10. Biggest single latency win for dashboard. | Phase 4 |
| Migration 008 (new indexes) covering: `orders(merchant_id, status, created_at desc)`, `orders(merchant_id, created_at desc)`, `order_items(order_id)`, `flags(merchant_id, is_resolved, priority, created_at desc)`, `products(merchant_id, is_active, created_at desc)`, `messages(merchant_id, conversation_id, created_at desc)`, `conversations(merchant_id, last_message_at desc)`, `customers(merchant_id, platform_user_id)` | Supports every list page and the RPC. | Phase 4 (merged into new `009_performance_indexes.sql`) |
| `Suspense` boundaries in `(app)` pages | Streaming + skeleton hand-off. | Phase 3 |
| Per-route `loading.tsx` skeletons with exact layout | Makes navigation feel instant. | Phase 3 |
| `UnreadCountProvider` + one `LazyUnreadCountSubscriber` (dynamic `ssr:false`) | Collapses N sidebar-consumer realtime subscriptions into 1. | Phase 1.4 |
| `PageTransition` rewrite to CSS-only fade | Drops Framer Motion from every app-route bundle. | Phase 2.6 |
| `<img>` → Next.js `<Image>` in product card/table | LCP, format negotiation, lazy loading. | Phase 2 |
| Dynamic import of heavy client components (`ChatThread`, `ReplyInput`, `ProductForm`, `StockAdjustmentDialog`, AI settings panels) | Defers hydration of forms/chat until needed. | Phase 2.6 |
| Products API pagination (`?limit`, `?offset`/`?cursor`, search, sort, status filters) | Supports cursor pagination in Phase 4. | Phase 4.3 |

### KEEP WITH MODIFICATION

| Change | Note |
|--------|------|
| Dashboard KPI cards as clickable `Link`s with hover lift (`-translate-y-0.5`) | User confirmed keep. Re-implement cleanly; ensure hover uses `transform` only and respects `prefers-reduced-motion`. |
| `ProductGrid` stagger | User confirmed restore as **CSS-only**, not Framer Motion. CSS keyframes + `animation-delay: calc(var(--i) * 40ms)` — same UX, zero JS library cost, zero dependency on Framer Motion in the inventory chunk. |
| `dashboard_metrics` RPC | Apply only after RLS review — function must be `SECURITY DEFINER` with explicit `WHERE merchant_id = p_merchant_id` and `GRANT EXECUTE TO authenticated`. |

### DISCARD

No purely-design regressions were identified in the prior branch's uncommitted changes that the user flagged as unwanted. The two mentioned candidates (removed product-grid stagger, removed dynamic year in footer copy) are both fixed by the plan — the stagger is restored (CSS) in Phase 1.9; the footer year decision is a design call (Phase 5 double-check).

---

## Section G — Data-fetching audit (file:line)

### `select('*')` on `main` — candidates for column narrowing
| File:line | Table | Context | Severity |
|-----------|-------|---------|----------|
| `src/app/(app)/dashboard/page.tsx:55` | `products` | Dashboard pulls full product rows only to compute out-of-stock and low-stock from `quantity_total`, `quantity_reserved`, `low_stock_threshold`, `name`, `id`. Pull only those columns. | High |
| `src/app/(app)/dashboard/page.tsx:65–101` | `orders`, `messages` | 10 parallel count-only queries (`{ count: 'exact', head: true }`). No data payload, so `*` is harmless — but 10 round trips is the cost. Replace with a single RPC. | Critical |
| `src/app/(app)/inventory/page.tsx:26` | `products` | List page pulls everything, then `InventoryContent` filters client-side. Narrow columns + pagination. | High |
| `src/app/(app)/inventory/[id]/page.tsx:31,42` | `products`, `stock_adjustments` | Detail pages can pull full rows safely — but `stock_adjustments` should be cap-limited (e.g. 50 most recent). | Low |
| `src/app/(app)/flags/page.tsx:27` | `flags` | Full rows (no pagination) — risky as flags accumulate. Narrow + paginate. | High |
| `src/app/(app)/conversations/page.tsx:26` | `conversations` + `customers` | Embedded select OK; currently no `.limit()`. Cap at 50 or paginate. | Medium |
| `src/app/api/products/route.ts:29` | `products` | List endpoint — should accept `?limit`, `?cursor`, `?search`, and return narrowed columns. | High |
| `src/app/api/products/[id]/route.ts:21` | `products` | Single-row detail; `*` is fine. | — |
| `src/app/api/messages/route.ts:50` | `messages` | Pulls all columns of a conversation's messages. Narrow to what the chat thread renders (`id, content, direction, sender_type, media_url, media_type, created_at`). | High |
| `src/lib/messaging/whatsapp.ts:133` | `messages` | `getConversationHistory` — narrow. | Medium |

### Sequential awaits that could be `Promise.all`
| File:line | Issue | Severity |
|-----------|-------|----------|
| `src/app/(app)/layout.tsx:20-31` | `getUser()` then merchant lookup. Sequential is necessary here (merchant query needs `user.id`), so leave as-is. | — |
| `src/app/(app)/dashboard/page.tsx:23-32` | Same: `getUser()` → merchants lookup → Promise.all of 10 queries. Already parallel once merchant.id is known. | — |
| `src/app/(app)/flags/page.tsx:12-30` | `getUser()` → merchant lookup → single flags query. No parallelism opportunity. Note: flags page doesn't fetch merchant_settings, which would be useful to have for context. | Low |
| `src/app/(app)/conversations/page.tsx:9-28` | Same as above. Conversations list OK. | — |
| `src/app/(app)/settings/page.tsx:12-39` | **Already good** — uses `Promise.all` over merchant_settings + merchant_faq. | — |
| `src/app/(app)/inventory/page.tsx:9-35` | **Already good** — parallel products + settings. | — |

On `main`, sequential-await issues are minimal. The dashboard's 10 parallel count queries is the single biggest data-fetch lift, solved by RPC in Phase 4.

### N+1 patterns
None found on `main`. `conversations/page.tsx` uses PostgREST embedded select for `customers(...)` — good pattern.

### List views missing `.limit()` or pagination
| Route | File | Count |
|-------|------|-------|
| `/inventory` | `src/app/(app)/inventory/page.tsx` | All active products, unbounded |
| `/flags` | `src/app/(app)/flags/page.tsx` | All unresolved flags, unbounded |
| `/conversations` | `src/app/(app)/conversations/page.tsx` | All conversations, unbounded |
| `/api/products` GET | `src/app/api/products/route.ts` | All active products, unbounded |
| `/api/messages` GET | `src/app/api/messages/route.ts` | All messages in conversation, unbounded |

All five must get cursor-based pagination in Phase 4 (UI) / Phase 1 (API boundaries).

---

## Section H — Fonts & config gaps

### Fonts (`src/app/layout.tsx:6-22`)
All three Google Fonts miss optimisation options:
```ts
const dmSans         = DM_Sans({         variable: "--font-sans",   subsets: ["latin"],  weight: ["400","500","600","700"] });
const notoNaskhArabic= Noto_Naskh_Arabic({ variable: "--font-arabic", subsets: ["arabic"], weight: ["400","500","600","700"] });
const jetbrainsMono  = JetBrains_Mono({   variable: "--font-mono",   subsets: ["latin"],  weight: ["400","500"] });
```
Missing on all three:
- `display: "swap"` → without this, Next's default is `optional`/`block` depending on context, which can delay first paint up to 3 s when the CDN is slow.
- `preload: true` (selectively): DM Sans should be preloaded (first-paint font); Noto Naskh Arabic and JetBrains Mono should NOT be preloaded (rendered only when Arabic text or data cells are present).
- `adjustFontFallback`: Next sets a sensible default; worth setting explicitly for CLS.

### `next.config.ts` (`main`)
Currently empty (just placeholder). Missing:
- `cacheComponents: true` (enable Server Component caching).
- `experimental.staleTimes: { dynamic: 30, static: 300 }`.
- `experimental.optimizePackageImports: ["lucide-react", "framer-motion", "@base-ui/react"]`.
- `images.remotePatterns` for Supabase Storage (required before swapping `<img>` → `<Image>`).

Analyzer is installed but disabled until `ANALYZE=true`; Phase 2 uses this path once `next build --webpack` is acceptable.

---

## Section I — Severity-rated issue list

### Critical
1. **Dashboard: 10 parallel count queries** (`src/app/(app)/dashboard/page.tsx:64-105`). Every visit to `/dashboard` issues 10 Supabase calls plus products + merchant_settings = 12 round trips. **Fix:** single `dashboard_metrics(p_merchant_id)` RPC (Phase 4.1).

### High
2. **No per-route `loading.tsx`** for `(app)/**`. The shared `(app)/loading.tsx` skeleton is generic and doesn't match any page's layout. Phase 3.1.
3. **`select('*')` on list pages** for products, flags, inventory. Phase 1.5 narrows them; Phase 4.3 adds cursor pagination.
4. **GSAP statically imported on landing** (5 files). Landing LCP suffers. Phase 2.4.
5. **Fonts missing `display: swap` and selective `preload`.** Every route is affected. Phase 2.1.
6. **PageTransition uses Framer Motion** for a 150 ms opacity fade, shipping Framer Motion into every `(app)` route's client bundle. Phase 2.6.
7. **No pagination on `/inventory`, `/flags`, `/conversations`, `/api/products`, `/api/messages`.** Blows up as data grows. Phase 4.3.

### Medium
8. `inventory-alerts.tsx` is unnecessarily a Client Component. Phase 1.1.
9. `useUnreadCount` refetches on every conversation Postgres event without debouncing. Phase 1.4.
10. `createClient()` in `src/lib/supabase/client.ts` is not a singleton — every caller builds a new browser client. Phase 1.7.
11. Realtime hooks (`useRealtimeConversations`, `useRealtimeMessages`) depend on `onUpdate` in the deps array — if consumers pass a non-memoised function, the channel re-subscribes on every render. Phase 1.3.
12. `src/app/(app)/layout.tsx:14-17` reads `x-pathname` header that is never set. Dead check. Phase 1.
13. Next.js 16 deprecation: `middleware` → `proxy` convention. Affects `src/middleware.ts`. Phase 1.8 (we're deleting middleware anyway, but document the direction).
14. `optimizePackageImports` not configured — `lucide-react`, `@base-ui/react`, `framer-motion` ship more than necessary. Phase 2.3.

### Low
15. `product-card.tsx` uses native `<img>` — no Next.js image optimisation. Phase 2 (requires `next.config.ts` `images.remotePatterns`).
16. `ProductGrid` Framer Motion stagger — restore as CSS (Phase 1.9).
17. `navbar.tsx` uses inert `motion.nav` with no animated props; replace with plain `<nav>` to drop Framer Motion from `/` chunk. Phase 2.
18. `inventory-content.tsx` refreshes by client-side fetch — `router.refresh()` would be tidier. Phase 3 (optional).
19. `layout.tsx:15` dead-header onboarding check. Phase 1 cleanup.

---

## Section J — Phase 0 exit

This report is complete. Outstanding items for later phases (not gaps in Phase 0):
- **Lighthouse numbers** — blocked on headless Chrome. User can capture locally with the commands in Section B. Re-run in Phase 5 for before/after.
- **Bundle analyzer treemap** — blocked on Turbopack incompatibility. Phase 2 will run `next build --webpack` one-time for a snapshot.

**Recommended action:** approve the findings in Sections F (catalogue) and I (severity list), then proceed to Phase 1 per the plan at `/Users/waleedsrb/.claude/plans/mo-een-performance-glistening-perlis.md`.

---

## Appendix: Phase plan at a glance

| Phase | Focus | Main files |
|-------|-------|-----------|
| 1 | Foundation (server conversion, realtime hardening, column narrowing, middleware → signout API, CSS grid stagger) | layout + page files, hooks, API routes |
| 2 | Bundles (fonts, optimizePackageImports, dynamic GSAP, dynamic heavy components, page-transition CSS) | `layout.tsx`, `next.config.ts`, landing sections |
| 3 | Perceived (per-route `loading.tsx`, shimmer, `useOptimistic`, hover prefetch) | 8 new `loading.tsx`, `globals.css` |
| 4 | Supabase (migration 009, dashboard_metrics RPC, cursor pagination hook + wiring) | new migration, new hook, list pages |
| 5 | Validation (Lighthouse re-run, design diff, slow-3G test, realtime smoke test) | this report + manual |

---

## Appendix K — Post-Phase-2 baseline (2026-04-17)

Captured after Phases 1 and 2 landed on `performance-rebuild`. Commits in scope: `3f825f9` (phase 1) through `4b589de` (phase 2). Purpose: real numbers before Phase 3 so Phase 5 has a before/after.

### K.1 Build cleanliness

- `npm run typecheck` — exits 0, zero errors.
- `npm run build` (Turbopack) — exits 0. Emits no route-size table in Next.js 16 Turbopack output; no warnings in the build tail.
- `ANALYZE=true npx next build --webpack` — exits 0, compile time 12.0s, typecheck 3.6s, 24 static pages generated. Note: Next.js 16 webpack output **also omits the legacy per-route JS size table**, so route totals must be derived from the chunk filesystem (K.2).

Deprecation notes carried forward:
- Turbopack `middleware` → `proxy` rename (informational; `src/middleware.ts` was deleted in Phase 1, so nothing to migrate).

### K.2 Route-level client JS (raw, uncompressed, from `.next/static/chunks/app/**`)

These are the **per-route page chunks only** (what's added on top of the shared vendor chunks in K.3):

| Route | Page chunk (bytes) | Notes |
|-------|--------------------|-------|
| `/` | 29,764 | Landing. Includes dynamic-import stubs for GSAP. |
| `(app)` layout | 14,822 | Loaded on every app route (sidebar, topbar, mobile nav, providers). |
| `/settings` | 34,401 | **Heaviest app page.** Still eagerly imports AI settings panels. |
| `/inventory/[id]` | 19,440 | Product detail + stock adjustment dialog. |
| `/inventory` | 16,526 | Inventory toolbar + grid/table + `next/image`. |
| `/conversations` | 14,701 | Shell only — `ChatThread` + `ReplyInput` are already dynamic. |
| `/login` | 13,514 | Auth form. |
| `/signup` | 14,599 | Auth form. |
| `/onboarding` | 10,507 | Business-basics form. |
| `/dashboard` | 6,347 | Server component; only client JS is inventory alerts + KPI cards. |
| `/flags` | 862 | Placeholder — no interactive client code yet. |
| `/orders` | 662 | Placeholder (Phase 5 deferred). |
| `/orders/[id]` | 277 | Placeholder only. |

`/settings` is the only app page that's unexpectedly large — Phase 2 step 2.6 planned to dynamically import its AI panels (`WhatsAppConnection`, `AIBehaviorSettings`, `AIPersonaSettings`, `AIFAQSettings`) and that's a confirmed Phase 2 gap.

### K.3 Shared vendor chunks (loaded with every route)

`rootMainFiles` per `.next/build-manifest.json`:

| Chunk | Size (bytes) | Package ID (matched strings) |
|-------|-------------:|------------------------------|
| `framework-*.js` | 189,700 | React core |
| `4bd1b696-*.js` | 199,870 | `react-dom` (client runtime + minified error stub) |
| `3794-*.js` | 221,958 | `react-dom` (reconciler + Fragment / Suspense / Portal / flushSync / preload APIs) |
| `main-d18698cd-*.js` | 137,001 | Next.js app-router runtime |
| `main-app-*.js` | 529 | entry stub |
| `webpack-*.js` | 3,941 | webpack runtime |
| `polyfills-*.js` | 112,594 | legacy-browser polyfills (not loaded by modern Chrome) |

**Shared baseline on a modern browser ≈ 753 KB raw** (framework + react-dom ×2 + main + webpack + entry, excluding polyfills). Gzip typically reduces to ~220–250 KB over the wire.

### K.4 Large shared vendor chunks (loaded on demand by routes that need them)

| Chunk | Size | Package(s) | Which routes pull it |
|-------|-----:|------------|----------------------|
| `3655-*.js` | **223,570** | `@supabase/supabase-js` + realtime + `auth-helpers` + `phoenix` + `ws` | every (app) route, `/login`, `/signup`, `/conversations` |
| `9398-*.js` | **119,341** | `framer-motion` (match: `motionValue`) | every (app) route — because `PageTransition` still uses `motion.div` |
| `3198-*.js` | 13,704 | (ui / misc) | various |
| `5706-*.js` | 27,499 | (ui / misc) | various |
| `8500-*.js` | 8,734 | (ui / misc) | various |

**Supabase is the single largest client dependency at 223 KB.** It is unavoidable for (app) routes, but it's currently in the login/signup path too via `src/lib/supabase/client.ts`. That's expected — the login form needs the browser client.

**Framer Motion still contaminates every (app) route** at 119 KB because of `src/components/layout/page-transition.tsx`. This was a Phase 2.6 task but wasn't completed. Phase 3 should absorb it.

### K.5 Lazy-loaded (async) chunks — landing-only

| Chunk | Size | Package |
|-------|-----:|---------|
| `c15bf2b0-*.js` | 51,699 | GSAP core |
| `3018-*.js` | 43,025 | GSAP + ScrollTrigger |
| `5911-*.js` | 19,441 | GSAP (plugin / helper) |
| **Total GSAP** | **~114 KB** | loaded only after `loadGsap()` resolves on scroll |

✓ **Confirmed: GSAP is not in any `rootMainFiles` chunk.** The Phase 2 lazy-load via `src/lib/animations/gsap.ts` works.

### K.6 Client-chunk package presence (greppable markers)

| Package | Marker searched | In client bundle? | Expected? |
|---------|-----------------|-------------------|-----------|
| `@supabase/supabase-js` | `createBrowserClient`, `supabase-js`, `phoenix` | ✓ chunk 3655 | ✓ |
| `framer-motion` | `motionValue`, `framerMotion` | ✓ chunk 9398 | ⚠ leaks into (app) routes via PageTransition |
| `gsap` | `gsap`, `ScrollTrigger` | ✓ async chunks only | ✓ lazy-load working |
| `@google/generative-ai` | `GoogleGenerativeAI`, `generativelanguage` | ✗ **not found anywhere** | ✓ **server-only confirmed** |
| `lucide-react` | `lucide-react`, `lucide_react` | ✗ not found | ✓ per-icon tree-shaking via `optimizePackageImports` |
| `@base-ui/react` | `@base-ui`, `base_ui` | ✗ not found | ✓ per-component tree-shaking |

### K.7 Analyzer reports on disk

- `.next/analyze/client.html` — 619 KB, full client treemap
- `.next/analyze/edge.html` — 275 KB, edge runtime (minimal)
- `.next/analyze/nodejs.html` — 771 KB, but printed "No bundles were parsed. Analyzer will show only original module sizes from stats file." Useful only for package-list, not for chunked-view.

Open `client.html` in a browser for the interactive treemap.

### K.8 Phase 3 readiness checklist

| Item | Status |
|------|--------|
| Shimmer keyframe in `src/app/globals.css` | ✗ absent — Phase 3.1 adds it |
| Per-route `loading.tsx` for 6 app routes (dashboard, orders, inventory, flags, conversations, settings) | ✓ present (scope creep from Phase 1) — contents use Tailwind `animate-pulse`, Phase 3 upgrades them to shimmer |
| `loading.tsx` for `orders/[id]` | ✗ missing |
| `loading.tsx` for `inventory/[id]` | ✗ missing |
| `useOptimistic` usage (orders status, flag resolution) | ✗ none in codebase (grep `src`) |
| Hover prefetch (`router.prefetch` + `onMouseEnter`) on product cards / order rows | ✗ none in codebase |
| Skeleton component has shimmer animation | ✗ uses `animate-pulse` (Tailwind opacity pulse) — Phase 3 swaps to gradient shimmer |

### K.9 Phase 2 gaps — carry into Phase 3 or backlog

Confirmed gaps vs the Phase 2 plan at `/Users/waleedsrb/.claude/plans/mo-een-performance-glistening-perlis.md`:

1. **Landing dynamic imports** (`src/app/page.tsx:4-8`) — below-the-fold sections still static. Phase 2.5. Est. saving: modest — initial landing HTML already fast; gains mostly below-the-fold hydration.
2. **`PageTransition` → CSS fade** (`src/components/layout/page-transition.tsx`) — still uses `motion.div`. Phase 2.6. **Impact: 119 KB Framer Motion chunk stays in every (app) route.** This is the single biggest remaining Phase 2 win.
3. **Inventory form dynamic imports** (`src/components/inventory/inventory-content.tsx`) — `ProductForm`, `StockAdjustmentDialog` static. Phase 2.6. Est. saving: ~5–10 KB on `/inventory` initial load.
4. **Sub-route `loading.tsx`** — `orders/[id]`, `inventory/[id]` missing. Phase 3.1.
5. **DM Sans font** — no explicit `preload: true` / `adjustFontFallback` (defaults are acceptable; note only).

**Recommendation:** absorb items 1–3 into a `perf(phase-2): cleanup` commit at the start of Phase 3, or fold into Phase 3's own commits. Item 4 is already Phase 3 scope.

### K.10 Lighthouse — desktop preset (2026-04-17, localhost, production build)

| Route (requested) | Route (measured) | Performance | LCP | CLS | TBT | Speed Index | FCP | Total bytes | Script bytes |
|-------------------|------------------|------------:|----:|----:|----:|------------:|----:|------------:|-------------:|
| `/` | `/` | **99** | 0.8 s | 0 | 0 ms | 0.9 s | 0.5 s | 467 KiB | 225 KiB |
| `/dashboard` | `/login` ⚠ | 100 | 0.7 s | 0 | 0 ms | 0.4 s | 0.3 s | 322 KiB | 235 KiB |
| `/orders` | `/login` ⚠ | 100 | 0.6 s | 0 | 0 ms | 0.3 s | 0.3 s | 322 KiB | 235 KiB |
| `/inventory` | `/login` ⚠ | 100 | 0.6 s | 0 | 0 ms | 0.3 s | 0.3 s | 323 KiB | 235 KiB |
| `/flags` | `/login` ⚠ | 100 | 0.6 s | 0 | 0 ms | 0.3 s | 0.3 s | 322 KiB | 235 KiB |

INP is not reported on first-load Lighthouse runs (it needs real interactions; `/` would need a manual INP harness or field data).

**⚠ Coverage gap:** four of the five runs landed on `/login`. Removing middleware in Phase 1 means `(app)/layout.tsx` runs `auth.getUser()` → `redirect("/login")` per-page when there's no session. Lighthouse sees the final rendered URL after redirect, so the dashboard/orders/inventory/flags runs above are effectively `/login` measured four times (identical numbers confirm this).

**What this still tells us:**
- Landing `/` is excellent: Perf 99, LCP 0.8 s, CLS 0, TBT 0 ms. 467 KiB total, 225 KiB of script. Phase 2's GSAP lazy-load is paying off — ~114 KB of GSAP chunks are _not_ in this 225 KiB.
- Login `/login` is excellent: Perf 100, LCP 0.6 s, 322 KiB total, 235 KiB of script. Supabase browser client is loaded (~223 KB raw → ~70–80 KB gzipped), matching expectations.
- Gzip compression factor: raw shared-vendor ~753 KB → ~230 KiB on the wire, ≈3.3× — consistent with the composition in K.3.

**To cover the authenticated app routes**, use the dev-only signin endpoint at `src/app/api/dev/lighthouse-signin/route.ts`. Only responds when `LIGHTHOUSE_BYPASS_ENABLED=true`; returns 404 otherwise.

Setup:
```bash
# .env.local — add temporarily
LIGHTHOUSE_BYPASS_ENABLED=true
LIGHTHOUSE_TEST_EMAIL=you@example.com
LIGHTHOUSE_TEST_PASSWORD=<existing password for a real merchant account>
```

Run:
```bash
# Terminal 1 — production build that picks up the env vars
npm run build && npm run start

# Terminal 2 — each route signs in first, then gets redirected into the app
npx lighthouse 'http://localhost:3000/api/dev/lighthouse-signin?next=/dashboard'     --view --preset=desktop --only-categories=performance
npx lighthouse 'http://localhost:3000/api/dev/lighthouse-signin?next=/orders'        --view --preset=desktop --only-categories=performance
npx lighthouse 'http://localhost:3000/api/dev/lighthouse-signin?next=/inventory'     --view --preset=desktop --only-categories=performance
npx lighthouse 'http://localhost:3000/api/dev/lighthouse-signin?next=/conversations' --view --preset=desktop --only-categories=performance
npx lighthouse 'http://localhost:3000/api/dev/lighthouse-signin?next=/flags'         --view --preset=desktop --only-categories=performance
npx lighthouse 'http://localhost:3000/api/dev/lighthouse-signin?next=/settings'      --view --preset=desktop --only-categories=performance
```

Lighthouse sees the redirect chain `signin → target` as a single navigation; the `finalDisplayedUrl` in each report will be the target path. Real RLS-scoped data loads as for a signed-in merchant.

**After capturing:** remove the three env vars from `.env.local` and restart. The endpoint then returns 404.

Authenticated-route numbers captured 2026-04-17 via the bypass endpoint. Re-capture after Phase 3 for before/after deltas.

| Route | Performance | LCP | CLS | TBT | Speed Index | FCP | Total | Script |
|-------|------------:|----:|----:|----:|------------:|----:|------:|-------:|
| `/dashboard` | **91** | 0.9 s | 0 | 0 ms | **3.6 s** ⚠ | 0.4 s | 470 KiB | 329 KiB |
| `/orders` | 97 | 0.9 s | 0 | 0 ms | 1.6 s | 0.3 s | 431 KiB | 328 KiB |
| `/inventory` | 98 | 0.9 s | 0 | 0 ms | 1.4 s | 0.3 s | 467 KiB | **363 KiB** |
| `/conversations` | 98 | 0.9 s | 0 | 0 ms | 1.5 s | 0.4 s | 472 KiB | 335 KiB |
| `/flags` | 97 | 0.9 s | 0 | 0 ms | 1.6 s | 0.3 s | 432 KiB | 328 KiB |
| `/settings` | 96 | 1.0 s | 0 | 0 ms | 1.8 s | 0.3 s | 497 KiB | **359 KiB** |

**Observations:**
- **LCP 0.9–1.0 s, CLS 0, TBT 0 ms across the board.** On localhost with a fast machine these numbers are excellent.
- **`/dashboard` Speed Index outlier at 3.6 s** despite LCP 0.9 s. This is the 10 parallel Supabase count queries + inventory alerts pattern — pixels paint fast but the full viewport keeps redrawing as each count resolves. The Phase 4 `dashboard_metrics` RPC (single round-trip) targets this directly.
- **`/inventory` has the heaviest script at 363 KiB** — matches the K.2 finding that ProductForm/StockAdjustmentDialog are not dynamically imported.
- **`/settings` next at 359 KiB** — matches the K.2 finding that AI panels are not dynamically imported.
- **`/orders` and `/flags` at 328 KiB** are the floor for an authenticated (app) route — this is the layout + PageTransition (Framer Motion) + Supabase vendor chunk + (app) shell. Any future `(app)` route starts here.
- **Delta vs `/login` (K.10 row 2, 235 KiB script): +93 KiB** per (app) route. That's the (app) layout chunk + Framer Motion. Phase 3's PageTransition→CSS cleanup should shave ~35–40 KiB gzipped from this floor.

### K.11 Issues surfaced by the baseline

1. **`PageTransition` Framer Motion leak** (K.4). Highest-impact Phase 2 cleanup. 119 KB on every (app) route.
2. **`/settings` is the heaviest app page chunk at 34 KB** (K.2) because its AI panels import eagerly. `next/dynamic` would help.
3. **Two react-dom-ish chunks** (199 KB + 222 KB, K.3) — both are in `rootMainFiles`. Not a bug; Next 16 + webpack splits react-dom into reconciler + client runtime. No action.
4. **No `app-build-manifest.json` in Next.js 16 webpack output** — per-route chunk maps must be inferred from the filesystem. Phase 5 re-measure should use the same chunk-listing approach for consistency.
5. **Lucide + Base-UI don't appear by name in chunks** — confirms `optimizePackageImports` is working. No action.
6. **Gemini SDK is not in any client chunk** — confirms server-only boundary holds. No action.

---

## Appendix K.12 — Post-Phase-3 Lighthouse (2026-04-17)

Captured after Phase 3 landed on `performance-rebuild`. Same command loop as K.10 (authenticated routes via `src/app/api/dev/lighthouse-signin`), same machine, same production build.

**Phase 3 changes that should move these numbers:** `PageTransition` → CSS fade (Framer Motion removed from every (app) route), landing below-the-fold `next/dynamic`, inventory `ProductForm` + settings AI panels `next/dynamic`, shimmer skeletons + layout-exact `inventory/[id]/loading.tsx`, `<Suspense>` around dashboard inventory alerts, `useOptimistic` on flag resolution, hover `router.prefetch` on product cards.

### K.12.1 Results

| Route | Performance | LCP | CLS | TBT | Speed Index | FCP | Total | Script |
|-------|------------:|----:|----:|----:|------------:|----:|------:|-------:|
| `/dashboard` | **92** | 0.9 s | 0 | 0 ms | 2.7 s | 0.3 s | 432 KiB | 291 KiB |
| `/orders` | 99 | 0.6 s | 0 | 0 ms | 1.3 s | 0.3 s | 391 KiB | 289 KiB |
| `/inventory` | 99 | 0.7 s | 0 | 0 ms | 1.3 s | 0.3 s | 430 KiB | 325 KiB |
| `/conversations` | 99 | 0.6 s | 0 | 0 ms | 1.2 s | 0.3 s | 433 KiB | 297 KiB |
| `/flags` | 99 | 0.6 s | 0 | 0 ms | 1.2 s | 0.3 s | 393 KiB | 291 KiB |
| `/settings` | 98 | 0.7 s | 0 | 0 ms | 1.4 s | 0.3 s | 457 KiB | 319 KiB |

### K.12.2 Deltas vs K.10 (Post-Phase-2)

| Route | Perf Δ | Script Δ | Total Δ | Speed Index Δ | LCP Δ |
|-------|-------:|---------:|--------:|--------------:|------:|
| `/dashboard` | **+1** (91→92) | **−38 KiB** (329→291) | **−38 KiB** (470→432) | **−0.9 s** (3.6→2.7) | 0.0 s |
| `/orders` | +2 (97→99) | −39 KiB (328→289) | −40 KiB (431→391) | −0.3 s (1.6→1.3) | −0.3 s |
| `/inventory` | +1 (98→99) | **−38 KiB** (363→325) | −37 KiB (467→430) | −0.1 s (1.4→1.3) | −0.2 s |
| `/conversations` | +1 (98→99) | −38 KiB (335→297) | −39 KiB (472→433) | −0.3 s (1.5→1.2) | −0.3 s |
| `/flags` | +2 (97→99) | −37 KiB (328→291) | −39 KiB (432→393) | −0.4 s (1.6→1.2) | −0.3 s |
| `/settings` | +2 (96→98) | **−40 KiB** (359→319) | −40 KiB (497→457) | −0.4 s (1.8→1.4) | −0.3 s |

### K.12.3 Observations

- **Framer Motion removal landed.** The ~37–40 KiB script drop on every (app) route matches the gzipped weight of the `motion` primitives chunk (K.4: 119 KB raw → ~35–40 KiB gzipped). `rg framer-motion src` confirms zero source imports.
- **Every (app) route now scores 98–99 Performance**, up from the 91–98 range. The authenticated (app) script floor fell from ~328 KiB (K.10 `/orders`) to ~289 KiB (K.12 `/orders`) — a new baseline for every future (app) route.
- **`/dashboard` Speed Index: 3.6 s → 2.7 s (−0.9 s).** Two factors: (1) less JS parse/execute once Framer Motion is gone; (2) `<Suspense>` around `InventoryAlertsAsync` lets the KPI grid + Today's Activity paint before the products query resolves, so the viewport stops redrawing earlier. The outlier is gone.
- **`/settings` script: 359 KiB → 319 KiB (−40 KiB).** Slightly bigger than the Framer Motion baseline drop — the additional savings come from `next/dynamic` on the four AI settings panels, which now split into lazy chunks rather than bundling into the settings page chunk.
- **`/inventory` script: 363 KiB → 325 KiB (−38 KiB).** `ProductForm` dynamic import deferred its ~5–10 KiB to an async chunk; the rest is the Framer Motion drop.
- **LCP improved 0.2–0.3 s on 5 of 6 routes** (dashboard flat at 0.9 s because LCP there is a text node, not a layout-sensitive element).
- **CLS 0, TBT 0 ms everywhere** — the shimmer loaders and streaming Suspense did not introduce jank, as intended.

### K.12.4 Remaining targets for Phase 4/5

1. **`/dashboard` Performance still 92** — the lowest of the six. Speed Index is 2.7 s because the 10 parallel Supabase count queries each trigger a micro-repaint. Phase 4's `dashboard_metrics` RPC collapses this into a single round trip. Expected SI improvement: further 1.0–1.5 s.
2. **`/inventory` script still 325 KiB** — `StockAdjustmentDialog` is already dynamic in `product-detail.tsx`, but the main inventory page still carries the toolbar + Base-UI Select + product card grid. Phase 4 cursor pagination will reduce initial render cost, not chunk size.
3. **`/settings` script still 319 KiB** — 30 KiB above the `/flags` floor. The remaining delta is the Base-UI form primitives (Tabs, Switch) used by the dynamic panels, plus Zod v4 validation wired into the AI behavior form.
4. **Lighthouse-visible INP** — still not reported on cold navigations; field data or a scripted interaction harness would be the next step if we want INP numbers.

### K.12.5 Raw artifacts

- `localhost_2026-04-17_21-43-16.report.html` — `/dashboard`
- `localhost_2026-04-17_21-43-35.report.html` — `/orders`
- `localhost_2026-04-17_21-43-49.report.html` — `/inventory`
- `localhost_2026-04-17_21-44-03.report.html` — `/conversations`
- `localhost_2026-04-17_21-44-17.report.html` — `/flags`
- `localhost_2026-04-17_21-44-30.report.html` — `/settings`
