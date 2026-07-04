-- ============================================================
-- Migration 014: AI confidence threshold bounds
-- ============================================================

-- Clamp any existing out-of-range rows back to the default so the
-- constraint can be added without violation.
UPDATE merchant_settings
  SET ai_confidence_threshold = 0.70
  WHERE ai_confidence_threshold IS NOT NULL
    AND (ai_confidence_threshold < 0.30 OR ai_confidence_threshold > 0.95);

-- Enforce the same bounds the Zod schema uses (0.30–0.95), allowing NULL.
ALTER TABLE merchant_settings
  ADD CONSTRAINT merchant_settings_ai_confidence_threshold_range
  CHECK (
    ai_confidence_threshold IS NULL
    OR (ai_confidence_threshold >= 0.30 AND ai_confidence_threshold <= 0.95)
  );
