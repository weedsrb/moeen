-- Durable AI execution foundation. Queue payloads contain database identifiers
-- only: no message bodies, provider credentials, or channel credentials.

CREATE EXTENSION IF NOT EXISTS pgmq;

SELECT pgmq.create('ai_inbound');
SELECT pgmq.create('ai_ack_fallback');
SELECT pgmq.create('ai_dead_letter');

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ai_processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_queue_message_id bigint,
  ADD COLUMN IF NOT EXISTS ai_acknowledged_at timestamptz;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_ai_processing_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_ai_processing_status_check
  CHECK (ai_processing_status IN (
    'pending', 'queued', 'processing', 'retry_wait', 'completed', 'skipped', 'dead_letter'
  ));

UPDATE messages
SET ai_processing_status = CASE WHEN ai_processed THEN 'completed' ELSE 'pending' END
WHERE ai_processing_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_messages_ai_processing_status
  ON messages (merchant_id, ai_processing_status, created_at)
  WHERE direction = 'inbound';

CREATE TABLE IF NOT EXISTS ai_runtime_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  ai_execution_backend text NOT NULL DEFAULT 'inline'
    CHECK (ai_execution_backend IN ('inline', 'queue')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_runtime_settings (singleton, ai_execution_backend)
VALUES (true, 'inline')
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE ai_runtime_settings ENABLE ROW LEVEL SECURITY;

-- No user policies: only service-role code may inspect or change the global
-- cutover switch. It is intentionally absent from merchant settings.

CREATE OR REPLACE FUNCTION enqueue_ai_inbound(
  p_message_id uuid,
  p_delay_seconds integer DEFAULT 8
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  v_message messages%ROWTYPE;
  v_queue_message_id bigint;
BEGIN
  SELECT * INTO v_message
  FROM messages
  WHERE id = p_message_id
    AND direction = 'inbound'
    AND message_type = 'text'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Eligible inbound message not found';
  END IF;

  IF v_message.ai_processing_status IN ('queued', 'processing', 'completed', 'skipped') THEN
    RETURN v_message.ai_queue_message_id;
  END IF;

  SELECT * INTO v_queue_message_id
  FROM pgmq.send(
    'ai_inbound',
    jsonb_build_object('message_id', p_message_id),
    GREATEST(0, LEAST(p_delay_seconds, 300))
  );

  UPDATE messages
  SET ai_processing_status = 'queued',
      ai_queue_message_id = v_queue_message_id
  WHERE id = p_message_id;

  RETURN v_queue_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_ai_ack_fallback(
  p_message_id uuid,
  p_delay_seconds integer DEFAULT 12
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  v_exists boolean;
  v_queue_message_id bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM messages
    WHERE id = p_message_id AND direction = 'inbound'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Inbound message not found';
  END IF;

  SELECT * INTO v_queue_message_id
  FROM pgmq.send(
    'ai_ack_fallback',
    jsonb_build_object('message_id', p_message_id),
    GREATEST(0, LEAST(p_delay_seconds, 300))
  );
  RETURN v_queue_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION claim_ai_inbound(
  p_visibility_seconds integer DEFAULT 60,
  p_batch_size integer DEFAULT 5
)
RETURNS TABLE (
  msg_id bigint,
  read_ct bigint,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
  SELECT * FROM pgmq.read(
    'ai_inbound',
    GREATEST(30, LEAST(p_visibility_seconds, 300)),
    GREATEST(1, LEAST(p_batch_size, 20))
  );
$$;

CREATE OR REPLACE FUNCTION claim_ai_ack_fallback(
  p_visibility_seconds integer DEFAULT 30,
  p_batch_size integer DEFAULT 10
)
RETURNS TABLE (
  msg_id bigint,
  read_ct bigint,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
  SELECT * FROM pgmq.read(
    'ai_ack_fallback',
    GREATEST(15, LEAST(p_visibility_seconds, 120)),
    GREATEST(1, LEAST(p_batch_size, 20))
  );
$$;

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
  IF p_status NOT IN ('completed', 'skipped') THEN
    RAISE EXCEPTION 'Completion status is invalid';
  END IF;

  SELECT pgmq.archive(p_queue_name, p_queue_message_id) INTO v_archived;
  IF p_queue_name = 'ai_inbound' THEN
    UPDATE messages
    SET ai_processing_status = p_status,
        ai_processed = true
    WHERE id = p_message_id;
  END IF;
  RETURN v_archived;
END;
$$;

CREATE OR REPLACE FUNCTION fail_ai_queue_message(
  p_queue_name text,
  p_queue_message_id bigint,
  p_message_id uuid,
  p_read_count integer,
  p_error_class text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  v_dead_id bigint;
BEGIN
  IF p_queue_name NOT IN ('ai_inbound', 'ai_ack_fallback') THEN
    RAISE EXCEPTION 'Queue is not allow-listed';
  END IF;

  IF p_read_count >= 5 THEN
    SELECT * INTO v_dead_id
    FROM pgmq.send(
      'ai_dead_letter',
      jsonb_build_object(
        'message_id', p_message_id,
        'source_queue', p_queue_name,
        'error_class', left(coalesce(p_error_class, 'unknown'), 100)
      )
    );
    PERFORM pgmq.archive(p_queue_name, p_queue_message_id);
    UPDATE messages
    SET ai_processing_status = 'dead_letter',
        ai_attempt_count = GREATEST(ai_attempt_count, p_read_count)
    WHERE id = p_message_id;
    RETURN 'dead_letter';
  END IF;

  UPDATE messages
  SET ai_processing_status = 'retry_wait',
      ai_attempt_count = GREATEST(ai_attempt_count, p_read_count)
  WHERE id = p_message_id;
  RETURN 'retry_wait';
END;
$$;

REVOKE ALL ON FUNCTION enqueue_ai_inbound(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enqueue_ai_ack_fallback(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_ai_inbound(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_ai_ack_fallback(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_ai_queue_message(text, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fail_ai_queue_message(text, bigint, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION enqueue_ai_inbound(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION enqueue_ai_ack_fallback(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_ai_inbound(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_ai_ack_fallback(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION complete_ai_queue_message(text, bigint, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION fail_ai_queue_message(text, bigint, uuid, integer, text) TO service_role;

COMMENT ON TABLE ai_runtime_settings IS
  'Service-role-only runtime cutover switch. Production defaults to the existing inline executor.';
