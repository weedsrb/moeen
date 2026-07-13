-- Audited, service-role-only production cutover controls. The inline backend
-- remains the safe default. Queue activation is refused until every merchant
-- has a fresh healthy worker heartbeat.

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_ai_processing_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_ai_processing_status_check
  CHECK (ai_processing_status IN (
    'pending', 'queued', 'processing', 'retry_wait', 'completed', 'skipped',
    'superseded', 'dead_letter'
  ));

CREATE TABLE IF NOT EXISTS ai_execution_backend_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  previous_backend text NOT NULL CHECK (previous_backend IN ('inline', 'queue')),
  next_backend text NOT NULL CHECK (next_backend IN ('inline', 'queue')),
  change_note text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_execution_backend_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ai_execution_backend_history FROM PUBLIC, anon, authenticated;

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
        ai_processed = true
    WHERE id = p_message_id;
  END IF;
  RETURN v_archived;
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_cutover_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'backend', (
      SELECT ai_execution_backend
      FROM ai_runtime_settings
      WHERE singleton = true
    ),
    'merchants', (SELECT count(*) FROM merchants),
    'healthy_merchants', (
      SELECT count(*)
      FROM ai_queue_health
      WHERE worker_status = 'healthy'
        AND last_heartbeat_at >= now() - interval '60 seconds'
    ),
    'stale_heartbeats', (
      SELECT count(*)
      FROM ai_queue_health
      WHERE last_heartbeat_at IS NULL
         OR last_heartbeat_at < now() - interval '60 seconds'
         OR worker_status <> 'healthy'
    ),
    'queued', (
      SELECT count(*) FROM messages WHERE ai_processing_status = 'queued'
    ),
    'processing', (
      SELECT count(*) FROM messages WHERE ai_processing_status = 'processing'
    ),
    'retry_wait', (
      SELECT count(*) FROM messages WHERE ai_processing_status = 'retry_wait'
    ),
    'dead_letter', (
      SELECT count(*) FROM messages WHERE ai_processing_status = 'dead_letter'
    ),
    'oldest_pending_at', (
      SELECT min(created_at)
      FROM messages
      WHERE ai_processing_status IN ('queued', 'processing', 'retry_wait')
    )
  );
$$;

CREATE OR REPLACE FUNCTION set_ai_execution_backend(
  p_backend text,
  p_change_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous text;
  v_merchant_count bigint;
  v_healthy_count bigint;
BEGIN
  IF p_backend NOT IN ('inline', 'queue') THEN
    RAISE EXCEPTION 'AI execution backend must be inline or queue';
  END IF;
  IF length(trim(coalesce(p_change_note, ''))) < 8 THEN
    RAISE EXCEPTION 'A cutover change note of at least 8 characters is required';
  END IF;

  SELECT ai_execution_backend INTO v_previous
  FROM ai_runtime_settings
  WHERE singleton = true
  FOR UPDATE;

  IF v_previous IS NULL THEN
    RAISE EXCEPTION 'AI runtime settings are missing';
  END IF;

  IF p_backend = 'queue' AND v_previous <> 'queue' THEN
    SELECT count(*) INTO v_merchant_count FROM merchants;
    SELECT count(*) INTO v_healthy_count
    FROM ai_queue_health
    WHERE worker_status = 'healthy'
      AND last_heartbeat_at >= now() - interval '60 seconds';

    IF v_healthy_count < v_merchant_count THEN
      RAISE EXCEPTION
        'Queue cutover refused: healthy worker heartbeats %/%',
        v_healthy_count,
        v_merchant_count;
    END IF;
  END IF;

  IF v_previous <> p_backend THEN
    UPDATE ai_runtime_settings
    SET ai_execution_backend = p_backend,
        updated_at = now()
    WHERE singleton = true;

    INSERT INTO ai_execution_backend_history (
      previous_backend,
      next_backend,
      change_note,
      changed_by
    ) VALUES (
      v_previous,
      p_backend,
      trim(p_change_note),
      coalesce(auth.jwt() ->> 'role', session_user)
    );
  END IF;

  RETURN get_ai_cutover_status();
END;
$$;

REVOKE ALL ON FUNCTION complete_ai_queue_message(text, bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_ai_cutover_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_ai_execution_backend(text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION complete_ai_queue_message(text, bigint, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION get_ai_cutover_status()
  TO service_role;
GRANT EXECUTE ON FUNCTION set_ai_execution_backend(text, text)
  TO service_role;

COMMENT ON FUNCTION set_ai_execution_backend(text, text) IS
  'Atomically changes the global AI executor. Queue activation requires fresh worker heartbeats; only service_role may execute.';

