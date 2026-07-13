-- Compact, privacy-conscious conversation memory. This stores a short rolling
-- summary and cursors only; complete prompts and customer transcripts remain in
-- their authoritative tables and are never copied here.

CREATE TABLE IF NOT EXISTS conversation_ai_state (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  detected_language text NOT NULL DEFAULT 'unknown'
    CHECK (detected_language IN ('ar', 'en', 'mixed', 'unknown')),
  last_summarized_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  context_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_ai_state_merchant
  ON conversation_ai_state (merchant_id, updated_at DESC);

ALTER TABLE conversation_ai_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own conversation AI state"
  ON conversation_ai_state FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

COMMENT ON TABLE conversation_ai_state IS
  'Bounded AI memory: short summary, detected language, and summary cursor. Never stores full prompts.';
