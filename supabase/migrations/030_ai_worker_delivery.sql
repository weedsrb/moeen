-- Worker lifecycle refinements and idempotent outbound acknowledgement records.

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_ai_processing_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_ai_processing_status_check
  CHECK (ai_processing_status IN (
    'pending', 'queued', 'processing', 'retry_wait', 'superseded',
    'completed', 'skipped', 'dead_letter'
  ));

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_delivery_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed', 'suppressed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_merchant_idempotency_key
  ON messages (merchant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_legacy_ai_processing_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ai_processed = true
     AND NEW.ai_processing_status NOT IN ('dead_letter', 'skipped') THEN
    NEW.ai_processing_status := 'completed';
  ELSIF NEW.ai_processed = false
        AND NEW.ai_processing_status = 'completed' THEN
    NEW.ai_processing_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_sync_ai_processing_status ON messages;
CREATE TRIGGER trg_messages_sync_ai_processing_status
  BEFORE INSERT OR UPDATE OF ai_processed ON messages
  FOR EACH ROW EXECUTE FUNCTION sync_legacy_ai_processing_status();

CREATE OR REPLACE FUNCTION complete_ai_queue_message(
  p_queue_name text,
  p_queue_message_id bigint,
  p_message_id uuid,
  p_status text DEFAULT 'completed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  v_archived boolean;
BEGIN
  IF p_queue_name NOT IN ('ai_inbound', 'ai_ack_fallback') THEN
    RAISE EXCEPTION 'Queue is not allow-listed';
  END IF;
  IF p_status NOT IN ('completed', 'skipped', 'superseded') THEN
    RAISE EXCEPTION 'Completion status is invalid';
  END IF;

  SELECT pgmq.archive(p_queue_name, p_queue_message_id) INTO v_archived;
  IF p_queue_name = 'ai_inbound' THEN
    UPDATE messages
    SET ai_processing_status = p_status,
        ai_processed = p_status <> 'superseded'
    WHERE id = p_message_id;
  END IF;
  RETURN v_archived;
END;
$$;

REVOKE ALL ON FUNCTION complete_ai_queue_message(text, bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_ai_queue_message(text, bigint, uuid, text)
  TO service_role;
