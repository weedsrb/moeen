-- Phase 3: Telegram webhook support
-- Adds columns for bot username and webhook secret verification

ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS telegram_bot_username text;
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS telegram_webhook_secret text;

-- Index for fast conversation list queries (sorted by last message)
CREATE INDEX IF NOT EXISTS idx_conversations_merchant_last_msg
  ON conversations (merchant_id, last_message_at DESC);

-- Index for idempotency checks on incoming messages
CREATE INDEX IF NOT EXISTS idx_messages_platform_id
  ON messages (platform_message_id)
  WHERE platform_message_id IS NOT NULL;
