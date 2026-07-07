-- ============================================================
-- Migration 018: AI pipeline circuit breaker (ai_status)
-- ============================================================
--
-- Adds a cooldown-based circuit breaker to merchant_settings so a merchant
-- whose Gemini calls are failing repeatedly stops hammering the API and burning
-- quota. When AI_FAILURE_THRESHOLD (3) `ai_unavailable` failures land inside a
-- 5-minute window, the pipeline TRIPS the breaker: ai_status -> 'paused',
-- ai_paused_at -> now(). While paused, inbound order signals FAST-FAIL straight
-- to an `ai_unavailable` flag WITHOUT calling Gemini, for a 10-minute cooldown.
--
-- The breaker can NEVER get permanently stuck. Once ai_paused_at is older than
-- the cooldown (AI_PAUSE_COOLDOWN_MS), the next order signal is allowed through
-- as a single "half-open" probe:
--   * probe SUCCEEDS  -> breaker resets to 'active', ai_paused_at -> NULL.
--   * probe FAILS     -> the failure counter re-trips it (fresh ai_paused_at).
--
-- All state transitions are performed by the AI pipeline under the service role
-- (bypassing RLS) and are wrapped so a breaker error never breaks message
-- processing. The thresholds/windows live in src/lib/ai/process.ts; these two
-- columns are the only persisted breaker state.

ALTER TABLE merchant_settings
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'active'
    CHECK (ai_status IN ('active', 'paused')),
  ADD COLUMN IF NOT EXISTS ai_paused_at timestamptz;

COMMENT ON COLUMN merchant_settings.ai_status IS
  'AI pipeline circuit-breaker state. ''paused'' means Gemini calls are being fast-failed during a cooldown after repeated failures; the next probe after the cooldown resets it to ''active'' on success.';

COMMENT ON COLUMN merchant_settings.ai_paused_at IS
  'When the breaker last tripped (ai_status -> paused). The cooldown elapses AI_PAUSE_COOLDOWN_MS after this timestamp; the next inbound order signal then runs one half-open Gemini probe. NULL while active.';
