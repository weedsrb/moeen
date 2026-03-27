## What

<!-- One sentence: what does this PR do? -->

## Why

<!-- Why is this change needed? Link to issue or context. -->

## Changes

<!-- Bullet list of what changed -->
-

## Phase

<!-- Which phase does this belong to, or is it cross-cutting? -->
- [ ] Phase 4 — AI Pipeline
- [ ] Phase 5 — Order Management
- [ ] Phase 6 — Automation (n8n)
- [ ] Bug fix
- [ ] Chore / maintenance

## Checklist

- [ ] `npm run build` passes locally
- [ ] `npm run lint` passes locally
- [ ] `npm run typecheck` passes locally
- [ ] No `any` types introduced
- [ ] All DB queries filter by `merchant_id`
- [ ] Sensitive operations are server-side (API routes, not client)
- [ ] New env vars added to `.env.example`
- [ ] New SQL migrations added to `supabase/migrations/`
