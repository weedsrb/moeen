CREATE OR REPLACE FUNCTION run_stale_order_scan(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate record;
  v_scanned integer := 0;
  v_notifications integer := 0;
  v_jobs integer := 0;
  v_resolved integer := 0;
  v_row_count integer := 0;
BEGIN
  IF NOT p_dry_run THEN
    UPDATE flags flag
    SET is_resolved = true, resolved_at = now()
    FROM orders current_order
    WHERE flag.order_id = current_order.id
      AND flag.category = 'stale_order'
      AND flag.is_resolved = false
      AND flag.automation_dedupe_key NOT LIKE
        'stale-order:' || current_order.id::text || ':' || current_order.status || ':%';
    GET DIAGNOSTICS v_resolved = ROW_COUNT;
  END IF;

  FOR candidate IN
    WITH order_state AS (
      SELECT order_row.id, order_row.merchant_id, order_row.order_number,
        order_row.status,
        coalesce(last_transition.created_at, order_row.created_at) AS status_since,
        settings.notification_email, settings.email_enabled,
        settings.email_verified_at, settings.email_critical_only,
        settings.stale_incoming_warning_minutes,
        settings.stale_incoming_critical_minutes,
        settings.stale_pending_hours,
        settings.stale_confirmed_hours
      FROM orders order_row
      JOIN merchant_automation_settings settings
        ON settings.merchant_id = order_row.merchant_id
      LEFT JOIN LATERAL (
        SELECT timeline.created_at
        FROM order_timeline timeline
        WHERE timeline.order_id = order_row.id
          AND timeline.to_status = order_row.status
        ORDER BY timeline.created_at DESC
        LIMIT 1
      ) last_transition ON true
      WHERE coalesce((settings.enabled_workflows->>'stale_order_alerts')::boolean, false)
        AND order_row.status IN ('incoming', 'pending', 'confirmed')
    ), thresholds AS (
      SELECT state.*, 'warning'::text AS threshold_name,
        'medium'::text AS priority,
        stale_incoming_warning_minutes AS threshold_minutes
      FROM order_state state WHERE status = 'incoming'
      UNION ALL
      SELECT state.*, 'critical', 'critical', stale_incoming_critical_minutes
      FROM order_state state WHERE status = 'incoming'
      UNION ALL
      SELECT state.*, 'pending', 'medium', stale_pending_hours * 60
      FROM order_state state WHERE status = 'pending'
      UNION ALL
      SELECT state.*, 'confirmed', 'critical', stale_confirmed_hours * 60
      FROM order_state state WHERE status = 'confirmed'
    )
    SELECT *, EXTRACT(EPOCH FROM (now() - status_since)) / 60 AS age_minutes
    FROM thresholds
    WHERE status_since <= now() - make_interval(mins => threshold_minutes)
    ORDER BY id, threshold_minutes
  LOOP
    v_scanned := v_scanned + 1;
    IF NOT p_dry_run THEN
      IF candidate.status = 'incoming' AND candidate.threshold_name = 'critical' THEN
        UPDATE flags SET is_resolved = true, resolved_at = now()
        WHERE merchant_id = candidate.merchant_id
          AND automation_dedupe_key =
            'stale-order:' || candidate.id::text || ':incoming:warning'
          AND is_resolved = false;
      END IF;

      INSERT INTO flags (
        merchant_id, order_id, priority, category, title, description,
        recommended_action, is_resolved, resolved_at, automation_dedupe_key
      ) VALUES (
        candidate.merchant_id, candidate.id, candidate.priority,
        'stale_order', 'Order needs attention',
        'Order ' || candidate.order_number || ' has remained ' || candidate.status ||
          ' beyond its ' || candidate.threshold_name || ' threshold.',
        'Review the order and advance or update its status.', false, NULL,
        'stale-order:' || candidate.id::text || ':' || candidate.status || ':' || candidate.threshold_name
      )
      ON CONFLICT (merchant_id, automation_dedupe_key)
        WHERE automation_dedupe_key IS NOT NULL
      DO UPDATE SET priority = EXCLUDED.priority, description = EXCLUDED.description,
        is_resolved = false, resolved_at = NULL;

      INSERT INTO merchant_notifications (
        merchant_id, flag_id, order_id, category, severity, title, body,
        dedupe_key, status, resolved_at, updated_at
      ) SELECT
        candidate.merchant_id, flag.id, candidate.id, 'stale_order',
        candidate.priority, 'Order needs attention',
        'Order ' || candidate.order_number || ' is still ' || candidate.status || '.',
        'stale-order:' || candidate.id::text || ':' || candidate.status,
        'unread', NULL, now()
      FROM flags flag
      WHERE flag.merchant_id = candidate.merchant_id
        AND flag.automation_dedupe_key =
          'stale-order:' || candidate.id::text || ':' || candidate.status || ':' || candidate.threshold_name
      ON CONFLICT (merchant_id, dedupe_key)
      DO UPDATE SET flag_id = EXCLUDED.flag_id, severity = EXCLUDED.severity,
        body = EXCLUDED.body, status = 'unread', resolved_at = NULL,
        updated_at = now();
      v_notifications := v_notifications + 1;

      IF candidate.email_enabled AND candidate.email_verified_at IS NOT NULL
         AND candidate.notification_email IS NOT NULL
         AND (NOT candidate.email_critical_only OR candidate.priority = 'critical') THEN
        INSERT INTO automation_jobs (
          merchant_id, workflow_type, idempotency_key, payload
        ) VALUES (
          candidate.merchant_id, 'stale-order-alerts',
          'stale-order-email:' || candidate.id::text || ':' || candidate.status || ':' || candidate.threshold_name,
          jsonb_build_object(
            'channel', 'email', 'to', candidate.notification_email,
            'subject', 'Muin order needs attention',
            'text', 'Order ' || candidate.order_number || ' is still ' || candidate.status || ' in Muin.',
            'order_id', candidate.id,
            'severity', candidate.priority
          )
        ) ON CONFLICT (merchant_id, idempotency_key) DO NOTHING;
        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_jobs := v_jobs + v_row_count;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'workflowType', 'stale-order-alerts', 'scanned', v_scanned,
    'notificationsUpserted', v_notifications, 'jobsUpserted', v_jobs,
    'resolved', v_resolved, 'dryRun', p_dry_run
  );
END;
$$;

REVOKE ALL ON FUNCTION run_stale_order_scan(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION run_stale_order_scan(boolean) TO service_role;

CREATE OR REPLACE FUNCTION resolve_stale_order_on_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE flags SET is_resolved = true, resolved_at = now()
  WHERE merchant_id = NEW.merchant_id
    AND order_id = NEW.order_id
    AND category = 'stale_order'
    AND automation_dedupe_key NOT LIKE
      'stale-order:' || NEW.order_id::text || ':' || NEW.to_status || ':%'
    AND is_resolved = false;
  UPDATE merchant_notifications
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE merchant_id = NEW.merchant_id
    AND order_id = NEW.order_id
    AND category = 'stale_order'
    AND dedupe_key <> 'stale-order:' || NEW.order_id::text || ':' || NEW.to_status
    AND status <> 'resolved';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_timeline_resolve_stale ON order_timeline;
CREATE TRIGGER trg_order_timeline_resolve_stale
  AFTER INSERT ON order_timeline
  FOR EACH ROW EXECUTE FUNCTION resolve_stale_order_on_transition();
