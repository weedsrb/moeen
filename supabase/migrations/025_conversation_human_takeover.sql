-- Conversation-level AI ownership. Merchant-wide provider health remains in
-- merchant_settings.ai_status; this state controls one customer conversation.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS automation_mode text NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS takeover_reason text,
  ADD COLUMN IF NOT EXISTS taken_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_automation_mode_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_automation_mode_check
  CHECK (automation_mode IN ('ai', 'human_takeover'));

CREATE INDEX IF NOT EXISTS idx_conversations_merchant_automation_mode
  ON conversations (merchant_id, automation_mode, last_message_at DESC);

COMMENT ON COLUMN conversations.automation_mode IS
  'Who owns the next reply: ai or human_takeover. Human takeover requires an explicit merchant resume.';
