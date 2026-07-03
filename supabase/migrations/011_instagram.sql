-- Phase 7: Instagram integration (Instagram API with Instagram Login)
-- Instagram replaces WhatsApp as the primary channel. WhatsApp columns are
-- left untouched (dormant) so WhatsApp remains re-addable via the provider seam.

-- Add Instagram columns to merchant_settings
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS instagram_connected boolean DEFAULT false;
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS instagram_user_id text;            -- IG business account ID (webhook → merchant lookup key)
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS instagram_username text;
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS instagram_access_token text;        -- long-lived token (~60 days), refreshed before expiry
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS instagram_token_expires_at timestamptz;

-- Webhook → merchant resolution path (single app-level endpoint keys on IG account ID)
CREATE INDEX IF NOT EXISTS idx_merchant_settings_ig_user_id
  ON merchant_settings (instagram_user_id)
  WHERE instagram_user_id IS NOT NULL;

-- Everywhere else, reuse the existing platform columns with the value "instagram":
--   customers(merchant_id, platform, platform_user_id)  -- platform_user_id = IGSID
--   conversations(platform, platform_chat_id)
--   messages(platform_message_id)                        -- idempotency via message mid
