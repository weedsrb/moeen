CREATE OR REPLACE FUNCTION run_daily_summary_schedule(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  merchant_row record;
  v_local_now timestamp;
  v_local_date date;
  v_messages integer;
  v_orders integer;
  v_delivered integer;
  v_open_flags integer;
  v_title text;
  v_body text;
  v_scanned integer := 0;
  v_notifications integer := 0;
  v_jobs integer := 0;
  v_row_count integer := 0;
BEGIN
  FOR merchant_row IN
    SELECT settings.*, merchant.business_name,
      coalesce(ai.ai_response_language, 'auto') AS response_language
    FROM merchant_automation_settings settings
    JOIN merchants merchant ON merchant.id = settings.merchant_id
    LEFT JOIN merchant_settings ai ON ai.merchant_id = settings.merchant_id
    WHERE coalesce((settings.enabled_workflows->>'daily_summary')::boolean, false)
  LOOP
    v_local_now := now() AT TIME ZONE merchant_row.timezone;
    v_local_date := v_local_now::date;
    IF v_local_now::time < merchant_row.daily_summary_time THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM merchant_notifications notification
      WHERE notification.merchant_id = merchant_row.merchant_id
        AND notification.dedupe_key = 'daily-summary:' || v_local_date::text
    ) THEN CONTINUE; END IF;

    v_scanned := v_scanned + 1;
    SELECT count(*) INTO v_messages FROM messages
    WHERE merchant_id = merchant_row.merchant_id
      AND direction = 'inbound'
      AND (created_at AT TIME ZONE merchant_row.timezone)::date = v_local_date;
    SELECT count(*) INTO v_orders FROM orders
    WHERE merchant_id = merchant_row.merchant_id
      AND status <> 'collecting'
      AND (created_at AT TIME ZONE merchant_row.timezone)::date = v_local_date;
    SELECT count(*) INTO v_delivered FROM orders
    WHERE merchant_id = merchant_row.merchant_id
      AND delivered_at IS NOT NULL
      AND (delivered_at AT TIME ZONE merchant_row.timezone)::date = v_local_date;
    SELECT count(*) INTO v_open_flags FROM flags
    WHERE merchant_id = merchant_row.merchant_id AND is_resolved = false;

    IF merchant_row.response_language = 'ar' THEN
      v_title := 'ملخص اليوم';
      v_body := 'الرسائل: ' || v_messages || '، الطلبات: ' || v_orders ||
        '، تم التوصيل: ' || v_delivered || '، التنبيهات المفتوحة: ' || v_open_flags || '.';
    ELSE
      v_title := 'Daily summary';
      v_body := 'Messages: ' || v_messages || ', orders: ' || v_orders ||
        ', delivered: ' || v_delivered || ', open alerts: ' || v_open_flags || '.';
    END IF;

    IF NOT p_dry_run THEN
      INSERT INTO merchant_notifications (
        merchant_id, category, severity, title, body, dedupe_key, metadata
      ) VALUES (
        merchant_row.merchant_id, 'daily_summary', 'info', v_title, v_body,
        'daily-summary:' || v_local_date::text,
        jsonb_build_object(
          'local_date', v_local_date, 'messages', v_messages, 'orders', v_orders,
          'delivered', v_delivered, 'open_flags', v_open_flags
        )
      ) ON CONFLICT (merchant_id, dedupe_key) DO NOTHING;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_notifications := v_notifications + v_row_count;

      IF merchant_row.email_enabled AND merchant_row.email_verified_at IS NOT NULL
         AND merchant_row.notification_email IS NOT NULL THEN
        INSERT INTO automation_jobs (
          merchant_id, workflow_type, idempotency_key, payload
        ) VALUES (
          merchant_row.merchant_id, 'daily-summary',
          'daily-summary-email:' || v_local_date::text,
          jsonb_build_object(
            'channel', 'email', 'to', merchant_row.notification_email,
            'subject', v_title || ' — ' || merchant_row.business_name,
            'text', v_body,
            'local_date', v_local_date,
            'severity', 'info'
          )
        ) ON CONFLICT (merchant_id, idempotency_key) DO NOTHING;
        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_jobs := v_jobs + v_row_count;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'workflowType', 'daily-summary', 'scanned', v_scanned,
    'notificationsUpserted', v_notifications, 'jobsUpserted', v_jobs,
    'dryRun', p_dry_run
  );
END;
$$;

REVOKE ALL ON FUNCTION run_daily_summary_schedule(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION run_daily_summary_schedule(boolean) TO service_role;
