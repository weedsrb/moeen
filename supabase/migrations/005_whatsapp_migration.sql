-- Phase 3 Revised: Replace Telegram with WhatsApp
-- Drop Telegram-specific columns from merchant_settings
ALTER TABLE merchant_settings DROP COLUMN IF EXISTS telegram_bot_token;
ALTER TABLE merchant_settings DROP COLUMN IF EXISTS telegram_connected;
ALTER TABLE merchant_settings DROP COLUMN IF EXISTS telegram_bot_username;
ALTER TABLE merchant_settings DROP COLUMN IF EXISTS telegram_webhook_secret;

-- Add WhatsApp Cloud API columns
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text;
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS whatsapp_access_token text;
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS whatsapp_verify_token text;
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS whatsapp_business_account_id text;
ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS whatsapp_display_phone text;
-- Note: whatsapp_connected boolean already exists from 001_initial_schema.sql

-- Indexes from migration 004 are kept (platform-agnostic):
--   idx_conversations_merchant_last_msg
--   idx_messages_platform_id
