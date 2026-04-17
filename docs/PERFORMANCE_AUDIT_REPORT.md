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
