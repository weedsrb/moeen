-- Merchant-controlled order requirements and delayed acknowledgement policy.
-- Legacy confidence/auto-clarify/auto-ack columns remain during rollback window.

ALTER TABLE merchant_settings
  ADD COLUMN IF NOT EXISTS ai_require_customer_name boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_require_customer_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_acknowledgement_mode text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS ai_ack_delay_seconds integer NOT NULL DEFAULT 12;

UPDATE merchant_settings
SET ai_acknowledgement_mode = 'delayed'
WHERE ai_auto_acknowledge = true
  AND ai_acknowledgement_mode = 'off';

ALTER TABLE merchant_settings
  DROP CONSTRAINT IF EXISTS merchant_settings_ai_acknowledgement_mode_check,
  DROP CONSTRAINT IF EXISTS merchant_settings_ai_ack_delay_seconds_check;

ALTER TABLE merchant_settings
  ADD CONSTRAINT merchant_settings_ai_acknowledgement_mode_check
    CHECK (ai_acknowledgement_mode IN ('off', 'delayed')),
  ADD CONSTRAINT merchant_settings_ai_ack_delay_seconds_check
    CHECK (ai_ack_delay_seconds BETWEEN 5 AND 60);

COMMENT ON COLUMN merchant_settings.ai_require_customer_name IS
  'Whether a customer name is required before order confirmation.';
COMMENT ON COLUMN merchant_settings.ai_require_customer_phone IS
  'Whether a customer phone is required before order confirmation.';
COMMENT ON COLUMN merchant_settings.ai_acknowledgement_mode IS
  'off or delayed. Delayed acknowledgements are sent only when no real reply arrives first.';
