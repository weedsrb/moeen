-- ============================================================
-- Migration 016: AI decision audit trail
-- ============================================================
--
-- Records one immutable row per Gemini call so every AI decision can be
-- attributed after the fact to an exact model/prompt revision. Before this
-- table, "why was this order auto-created vs. flagged?" was unanswerable once
-- the pipeline had run, and prompt changes could not be A/B compared.
--
-- Rows are written server-side by the AI pipeline (service role, bypassing
-- RLS) and are proportional to Gemini spend — one per model call, NOT one per
-- inbound message. Pre-Gemini skips (no regex signal, content dedup, debounce
-- yield) are deliberately NOT recorded here; they remain observable via
-- messages.has_order_signal / messages.ai_processed.
--
-- `effective_confidence` equals `gemini_confidence` today; it is reserved for
-- a future deterministic re-scoring layer that could adjust the raw model
-- score without losing the original.

CREATE TABLE ai_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations ON DELETE CASCADE,
  message_id uuid REFERENCES messages ON DELETE CASCADE,
  order_id uuid REFERENCES orders ON DELETE SET NULL,
  model_version text NOT NULL,
  prompt_version text NOT NULL,
  -- sha256 hex of the effective (burst-coalesced) content that was scored.
  input_hash text NOT NULL,
  -- Raw model confidence. NULL when Gemini failed (the ai_unavailable case).
  gemini_confidence decimal,
  -- Equals gemini_confidence today; reserved for deterministic re-scoring.
  effective_confidence decimal,
  decision_case text NOT NULL CHECK (decision_case IN (
    'ai_unavailable',
    'intent_other',
    'question_answered',
    'question_flagged',
    'order_auto_created',
    'order_clarify_sent',
    'order_created_flagged',
    'order_proposal_created'
  )),
  -- {invalidProductIds, priceCorrections} from createOrderFromAI, order cases only.
  validation_diagnostics jsonb,
  created_at timestamptz DEFAULT now()
);

-- Audit browsing: merchant-scoped, newest first.
CREATE INDEX idx_ai_decisions_merchant_created
  ON ai_decisions (merchant_id, created_at DESC);

-- Reverse lookup from a message to its decision(s).
CREATE INDEX idx_ai_decisions_message
  ON ai_decisions (message_id);

-- Enable RLS
ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;

-- Merchants can view their own AI decisions. Writes come from the service role
-- (which bypasses RLS), so no INSERT/UPDATE/DELETE policies are defined —
-- these rows are an immutable audit trail from the merchant's perspective.
CREATE POLICY "Merchants can view own AI decisions"
  ON ai_decisions FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
