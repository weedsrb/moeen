-- HMAC replay protection, atomic job leasing, and new-order notification outbox.

CREATE TABLE automation_hmac_replays (
  signature_hash text PRIMARY KEY,
  key_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE automation_hmac_replays ENABLE ROW LEVEL SECURITY;
-- Service role only; no user-facing policies.

CREATE INDEX idx_automation_hmac_replays_expiry
  ON automation_hmac_replays (expires_at);

CREATE OR REPLACE FUNCTION automation_is_quiet_hours(
  p_timezone text,
  p_start time,
  p_end time,
  p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_local_time time := (p_now AT TIME ZONE p_timezone)::time;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start = p_end THEN RETURN false; END IF;
  IF p_start < p_end THEN
    RETURN v_local_time >= p_start AND v_local_time < p_end;
  END IF;
  RETURN v_local_time >= p_start OR v_local_time < p_end;
END;
$$;

CREATE OR REPLACE FUNCTION claim_automation_jobs(
  p_workflow_type text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF automation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT jobs.id
    FROM automation_jobs jobs
    JOIN merchant_automation_settings settings
      ON settings.merchant_id = jobs.merchant_id
    WHERE jobs.workflow_type = p_workflow_type
      AND jobs.scheduled_at <= now()
      AND jobs.attempt_count < jobs.max_attempts
      AND (
        jobs.status IN ('queued', 'deferred') OR
        (jobs.status = 'claimed' AND jobs.lease_expires_at < now())
      )
      AND NOT automation_is_quiet_hours(
        settings.timezone,
        settings.quiet_hours_start,
        settings.quiet_hours_end
      )
    ORDER BY jobs.scheduled_at, jobs.created_at
    FOR UPDATE OF jobs SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 50))
  )
  UPDATE automation_jobs jobs
  SET status = 'claimed',
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 600))),
      attempt_count = jobs.attempt_count + 1,
      updated_at = now()
  FROM candidates
  WHERE jobs.id = candidates.id
  RETURNING jobs.*;
END;
$$;

CREATE OR REPLACE FUNCTION complete_automation_job(
  p_job_id uuid,
  p_provider_message_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job automation_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status = 'completed' THEN RETURN false; END IF;
  IF v_job.status <> 'claimed' THEN RETURN false; END IF;

  UPDATE automation_jobs
  SET status = 'completed', completed_at = now(), lease_expires_at = NULL,
      payload = payload || jsonb_build_object('provider_message_id', p_provider_message_id),
      updated_at = now()
  WHERE id = p_job_id;

  IF v_job.payload->>'channel' = 'email' THEN
    INSERT INTO automation_email_usage (merchant_id, usage_date, sent_count)
    VALUES (v_job.merchant_id, current_date, 1)
    ON CONFLICT (merchant_id, usage_date)
    DO UPDATE SET sent_count = automation_email_usage.sent_count + 1;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION fail_automation_job(
  p_job_id uuid,
  p_error_class text,
  p_error_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job automation_jobs%ROWTYPE;
  v_terminal boolean;
BEGIN
  SELECT * INTO v_job FROM automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Automation job not found'; END IF;
  IF v_job.status = 'completed' THEN RETURN 'completed'; END IF;
  v_terminal := v_job.attempt_count >= v_job.max_attempts;

  UPDATE automation_jobs
  SET status = CASE WHEN v_terminal THEN 'failed' ELSE 'queued' END,
      scheduled_at = CASE
        WHEN v_terminal THEN scheduled_at
        ELSE now() + make_interval(mins => LEAST(60, power(2, GREATEST(0, attempt_count - 1))::integer))
      END,
      lease_expires_at = NULL,
      last_error_class = left(coalesce(p_error_class, 'unknown'), 100),
      updated_at = now()
  WHERE id = p_job_id;

  INSERT INTO automation_workflow_errors (
    merchant_id, automation_job_id, workflow_type, error_class, error_message
  ) VALUES (
    v_job.merchant_id, v_job.id, v_job.workflow_type,
    left(coalesce(p_error_class, 'unknown'), 100),
    left(p_error_message, 500)
  );

  IF v_terminal THEN
    INSERT INTO merchant_notifications (
      merchant_id, category, severity, title, body, dedupe_key
    ) VALUES (
      v_job.merchant_id, 'workflow_error', 'critical',
      'Merchant automation needs attention',
      'A merchant workflow exhausted its retry limit. Dashboard delivery remains available.',
      'workflow-error:' || v_job.id::text
    ) ON CONFLICT (merchant_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN CASE WHEN v_terminal THEN 'failed' ELSE 'queued' END;
END;
$$;

REVOKE ALL ON FUNCTION claim_automation_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_automation_job(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fail_automation_job(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_automation_jobs(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION complete_automation_job(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION fail_automation_job(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION notify_new_incoming_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_business_name text;
  v_settings merchant_automation_settings%ROWTYPE;
BEGIN
  IF NEW.from_status <> 'collecting' OR NEW.to_status <> 'incoming' OR NEW.changed_by <> 'ai' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
  SELECT business_name INTO v_business_name FROM merchants WHERE id = NEW.merchant_id;
  SELECT * INTO v_settings FROM merchant_automation_settings WHERE merchant_id = NEW.merchant_id;
  IF NOT FOUND OR NOT coalesce((v_settings.enabled_workflows->>'new_order_alerts')::boolean, false) THEN
    RETURN NEW;
  END IF;

  INSERT INTO merchant_notifications (
    merchant_id, order_id, category, severity, title, body, dedupe_key
  ) VALUES (
    NEW.merchant_id, NEW.order_id, 'new_order', 'info', 'New order received',
    'Order ' || v_order.order_number || ' is ready for merchant review.',
    'new-order:' || NEW.order_id::text || ':incoming'
  ) ON CONFLICT (merchant_id, dedupe_key) DO NOTHING;

  IF v_settings.email_enabled AND v_settings.email_verified_at IS NOT NULL
     AND v_settings.notification_email IS NOT NULL THEN
    INSERT INTO automation_jobs (
      merchant_id, workflow_type, idempotency_key, payload
    ) VALUES (
      NEW.merchant_id,
      'new-order-alerts',
      'new-order-email:' || NEW.order_id::text || ':incoming',
      jsonb_build_object(
        'channel', 'email',
        'to', v_settings.notification_email,
        'subject', 'New Muin order ' || v_order.order_number,
        'text', v_business_name || ' received order ' || v_order.order_number || '. Open Muin to review it.',
        'order_id', NEW.order_id
      )
    ) ON CONFLICT (merchant_id, idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_timeline_new_order_notification ON order_timeline;
CREATE TRIGGER trg_order_timeline_new_order_notification
  AFTER INSERT ON order_timeline
  FOR EACH ROW EXECUTE FUNCTION notify_new_incoming_order();
