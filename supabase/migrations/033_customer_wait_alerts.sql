ALTER TABLE flags
  ADD COLUMN IF NOT EXISTS automation_dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_flags_automation_dedupe
  ON flags (merchant_id, automation_dedupe_key)
  WHERE automation_dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION run_customer_wait_scan(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate record;
  existing_priority text;
  v_scanned integer := 0;
  v_notifications integer := 0;
  v_jobs integer := 0;
  v_resolved integer := 0;
  v_priority text;
  v_threshold text;
  v_row_count integer := 0;
BEGIN
  IF NOT p_dry_run THEN
    WITH resolved_flags AS (
      UPDATE flags f
      SET is_resolved = true, resolved_at = now()
      FROM messages inbound
      WHERE f.category = 'customer_waiting'
        AND f.is_resolved = false
        AND f.message_id = inbound.id
        AND EXISTS (
          SELECT 1 FROM messages outbound
          WHERE outbound.conversation_id = f.conversation_id
            AND outbound.direction = 'outbound'
            AND outbound.created_at > inbound.created_at
        )
      RETURNING f.merchant_id, f.conversation_id
    )
    UPDATE merchant_notifications notification
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    FROM resolved_flags resolved
    WHERE notification.merchant_id = resolved.merchant_id
      AND notification.dedupe_key = 'customer-wait:' || resolved.conversation_id::text
      AND notification.status <> 'resolved';
    GET DIAGNOSTICS v_resolved = ROW_COUNT;
  END IF;

  FOR candidate IN
    WITH latest_inbound AS (
      SELECT DISTINCT ON (message.conversation_id)
        message.id, message.merchant_id, message.conversation_id,
        message.created_at, message.ai_processing_status
      FROM messages message
      WHERE message.direction = 'inbound'
        AND message.message_type = 'text'
      ORDER BY message.conversation_id, message.created_at DESC, message.id DESC
    )
    SELECT inbound.*, settings.wait_medium_minutes,
      settings.wait_critical_minutes, settings.email_enabled,
      settings.email_verified_at, settings.notification_email,
      settings.email_critical_only,
      EXTRACT(EPOCH FROM (now() - inbound.created_at)) / 60 AS age_minutes
    FROM latest_inbound inbound
    JOIN merchant_automation_settings settings
      ON settings.merchant_id = inbound.merchant_id
    WHERE coalesce((settings.enabled_workflows->>'customer_wait_alerts')::boolean, false)
      AND inbound.created_at <= now() - make_interval(mins => settings.wait_medium_minutes)
      AND inbound.ai_processing_status NOT IN ('queued', 'processing', 'retry_wait')
      AND NOT EXISTS (
        SELECT 1 FROM messages outbound
        WHERE outbound.conversation_id = inbound.conversation_id
          AND outbound.direction = 'outbound'
          AND outbound.created_at > inbound.created_at
      )
  LOOP
    existing_priority := NULL;
    v_scanned := v_scanned + 1;
    v_priority := CASE
      WHEN candidate.age_minutes >= candidate.wait_critical_minutes THEN 'critical'
      ELSE 'medium'
    END;
    v_threshold := CASE WHEN v_priority = 'critical' THEN 'critical' ELSE 'medium' END;
    SELECT priority INTO existing_priority
    FROM flags
    WHERE merchant_id = candidate.merchant_id
      AND automation_dedupe_key = 'customer-wait:' || candidate.conversation_id::text
      AND is_resolved = false;

    IF NOT p_dry_run THEN
      INSERT INTO flags (
        merchant_id, conversation_id, message_id, priority, category, title,
        description, recommended_action, is_resolved, resolved_at,
        automation_dedupe_key
      ) VALUES (
        candidate.merchant_id, candidate.conversation_id, candidate.id,
        v_priority, 'customer_waiting', 'Customer is waiting',
        'The latest customer message has not received an outbound response.',
        'Open the conversation and reply to the customer.', false, NULL,
        'customer-wait:' || candidate.conversation_id::text
      )
      ON CONFLICT (merchant_id, automation_dedupe_key)
        WHERE automation_dedupe_key IS NOT NULL
      DO UPDATE SET
        message_id = EXCLUDED.message_id,
        priority = CASE
          WHEN flags.is_resolved THEN EXCLUDED.priority
          WHEN flags.priority = 'critical' THEN 'critical'
          ELSE EXCLUDED.priority
        END,
        is_resolved = false,
        resolved_at = NULL;

      INSERT INTO merchant_notifications (
        merchant_id, flag_id, category, severity, title, body, dedupe_key,
        status, resolved_at, updated_at
      ) SELECT
        candidate.merchant_id, flag.id, 'customer_waiting', v_priority,
        'Customer is waiting',
        CASE WHEN v_priority = 'critical'
          THEN 'A customer has waited beyond the critical response threshold.'
          ELSE 'A customer has waited beyond the response threshold.' END,
        'customer-wait:' || candidate.conversation_id::text,
        'unread', NULL, now()
      FROM flags flag
      WHERE flag.merchant_id = candidate.merchant_id
        AND flag.automation_dedupe_key = 'customer-wait:' || candidate.conversation_id::text
      ON CONFLICT (merchant_id, dedupe_key)
      DO UPDATE SET severity = EXCLUDED.severity, body = EXCLUDED.body,
        flag_id = EXCLUDED.flag_id, status = 'unread', resolved_at = NULL,
        updated_at = now();
      v_notifications := v_notifications + 1;

      IF candidate.email_enabled AND candidate.email_verified_at IS NOT NULL
         AND candidate.notification_email IS NOT NULL
         AND (NOT candidate.email_critical_only OR v_priority = 'critical')
         AND (existing_priority IS NULL OR (existing_priority <> 'critical' AND v_priority = 'critical')) THEN
        INSERT INTO automation_jobs (
          merchant_id, workflow_type, idempotency_key, payload
        ) VALUES (
          candidate.merchant_id, 'customer-wait-alerts',
          'customer-wait-email:' || candidate.conversation_id::text || ':' || candidate.id::text || ':' || v_threshold,
          jsonb_build_object(
            'channel', 'email', 'to', candidate.notification_email,
            'subject', 'Muin customer response alert',
            'text', 'A customer conversation is waiting for a response in Muin.',
            'conversation_id', candidate.conversation_id,
            'severity', v_priority
          )
        ) ON CONFLICT (merchant_id, idempotency_key) DO NOTHING;
        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_jobs := v_jobs + v_row_count;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'workflowType', 'customer-wait-alerts',
    'scanned', v_scanned,
    'notificationsUpserted', v_notifications,
    'jobsUpserted', v_jobs,
    'resolved', v_resolved,
    'dryRun', p_dry_run
  );
END;
$$;

REVOKE ALL ON FUNCTION run_customer_wait_scan(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION run_customer_wait_scan(boolean) TO service_role;

CREATE OR REPLACE FUNCTION resolve_customer_wait_on_outbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction <> 'outbound' THEN RETURN NEW; END IF;
  UPDATE flags
  SET is_resolved = true, resolved_at = now()
  WHERE merchant_id = NEW.merchant_id
    AND conversation_id = NEW.conversation_id
    AND category = 'customer_waiting'
    AND is_resolved = false;
  UPDATE merchant_notifications
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE merchant_id = NEW.merchant_id
    AND dedupe_key = 'customer-wait:' || NEW.conversation_id::text
    AND status <> 'resolved';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_resolve_customer_wait ON messages;
CREATE TRIGGER trg_messages_resolve_customer_wait
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION resolve_customer_wait_on_outbound();
