-- ============================================================
-- Migration 006: AI Settings — merchant layer + FAQ table
-- ============================================================

-- Scalar merchant-layer fields on merchant_settings
ALTER TABLE merchant_settings
  ADD COLUMN IF NOT EXISTS ai_persona_name text,
  ADD COLUMN IF NOT EXISTS ai_tone text NOT NULL DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS ai_greeting text,
  ADD COLUMN IF NOT EXISTS ai_business_context text,
  ADD COLUMN IF NOT EXISTS ai_custom_instructions text,
  ADD COLUMN IF NOT EXISTS ai_response_language text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS ai_auto_acknowledge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_acknowledge_template text;

-- FAQ / knowledge base table
CREATE TABLE IF NOT EXISTS merchant_faq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_faq_merchant_id_idx
  ON merchant_faq(merchant_id, display_order);

ALTER TABLE merchant_faq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants manage own FAQ"
  ON merchant_faq FOR ALL
  USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT id FROM merchants WHERE user_id = auth.uid()
    )
  );
