CREATE TABLE product_inventory_alert_state (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  alert_state text NOT NULL DEFAULT 'healthy'
    CHECK (alert_state IN ('healthy', 'low', 'out')),
  episode integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_inventory_alert_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchants view own inventory alert state"
  ON product_inventory_alert_state FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION inventory_alert_state(
  p_available integer,
  p_threshold integer,
  p_active boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN NOT coalesce(p_active, true) THEN 'healthy'
    WHEN p_available <= 0 THEN 'out'
    WHEN p_available <= p_threshold THEN 'low'
    ELSE 'healthy'
  END;
$$;

CREATE OR REPLACE FUNCTION handle_inventory_threshold_crossing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings merchant_automation_settings%ROWTYPE;
  v_previous_state text;
  v_new_state text;
  v_threshold integer;
  v_episode integer;
  v_available integer := coalesce(NEW.quantity_total, 0) - coalesce(NEW.quantity_reserved, 0);
  v_should_email boolean;
BEGIN
  SELECT * INTO v_settings
  FROM merchant_automation_settings WHERE merchant_id = NEW.merchant_id;
  IF NOT FOUND OR NOT coalesce((v_settings.enabled_workflows->>'inventory_alerts')::boolean, false) THEN
    RETURN NEW;
  END IF;
  v_threshold := coalesce(NEW.low_stock_threshold, v_settings.inventory_low_threshold);

  SELECT alert_state, episode INTO v_previous_state, v_episode
  FROM product_inventory_alert_state
  WHERE product_id = NEW.id
  FOR UPDATE;
  IF NOT FOUND THEN
    v_previous_state := CASE WHEN TG_OP = 'INSERT' THEN 'healthy' ELSE
      inventory_alert_state(
        coalesce(OLD.quantity_total, 0) - coalesce(OLD.quantity_reserved, 0),
        coalesce(OLD.low_stock_threshold, v_settings.inventory_low_threshold),
        OLD.is_active
      ) END;
    v_episode := 0;
  END IF;

  v_new_state := inventory_alert_state(v_available, v_threshold, NEW.is_active);
  IF v_new_state = v_previous_state THEN RETURN NEW; END IF;
  IF v_previous_state = 'healthy' AND v_new_state <> 'healthy' THEN
    v_episode := v_episode + 1;
  END IF;

  INSERT INTO product_inventory_alert_state (
    product_id, merchant_id, alert_state, episode, updated_at
  ) VALUES (NEW.id, NEW.merchant_id, v_new_state, v_episode, now())
  ON CONFLICT (product_id) DO UPDATE
  SET alert_state = EXCLUDED.alert_state,
      episode = EXCLUDED.episode,
      updated_at = now();

  IF v_new_state = 'healthy' THEN
    UPDATE flags SET is_resolved = true, resolved_at = now()
    WHERE merchant_id = NEW.merchant_id
      AND automation_dedupe_key = 'inventory:' || NEW.id::text
      AND is_resolved = false;
    UPDATE merchant_notifications
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    WHERE merchant_id = NEW.merchant_id
      AND dedupe_key = 'inventory:' || NEW.id::text
      AND status <> 'resolved';
    RETURN NEW;
  END IF;

  INSERT INTO flags (
    merchant_id, priority, category, title, description, recommended_action,
    is_resolved, resolved_at, automation_dedupe_key
  ) VALUES (
    NEW.merchant_id,
    CASE WHEN v_new_state = 'out' THEN 'critical' ELSE 'medium' END,
    CASE WHEN v_new_state = 'out' THEN 'out_of_stock' ELSE 'low_stock' END,
    CASE WHEN v_new_state = 'out' THEN 'Product is out of stock' ELSE 'Product stock is low' END,
    NEW.name || ' has ' || v_available || ' available.',
    'Review inventory and restock the product.',
    false, NULL, 'inventory:' || NEW.id::text
  )
  ON CONFLICT (merchant_id, automation_dedupe_key)
    WHERE automation_dedupe_key IS NOT NULL
  DO UPDATE SET
    priority = EXCLUDED.priority,
    category = EXCLUDED.category,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    is_resolved = false,
    resolved_at = NULL;

  INSERT INTO merchant_notifications (
    merchant_id, flag_id, category, severity, title, body, dedupe_key,
    status, resolved_at, updated_at
  ) SELECT
    NEW.merchant_id, flag.id, 'inventory',
    CASE WHEN v_new_state = 'out' THEN 'critical' ELSE 'medium' END,
    CASE WHEN v_new_state = 'out' THEN 'Product is out of stock' ELSE 'Product stock is low' END,
    NEW.name || ' has ' || v_available || ' available.',
    'inventory:' || NEW.id::text, 'unread', NULL, now()
  FROM flags flag
  WHERE flag.merchant_id = NEW.merchant_id
    AND flag.automation_dedupe_key = 'inventory:' || NEW.id::text
  ON CONFLICT (merchant_id, dedupe_key)
  DO UPDATE SET flag_id = EXCLUDED.flag_id, severity = EXCLUDED.severity,
    title = EXCLUDED.title, body = EXCLUDED.body, status = 'unread',
    resolved_at = NULL, updated_at = now();

  v_should_email :=
    (v_previous_state = 'healthy' OR (v_previous_state = 'low' AND v_new_state = 'out'))
    AND v_settings.email_enabled
    AND v_settings.email_verified_at IS NOT NULL
    AND v_settings.notification_email IS NOT NULL
    AND (NOT v_settings.email_critical_only OR v_new_state = 'out');
  IF v_should_email THEN
    INSERT INTO automation_jobs (
      merchant_id, workflow_type, idempotency_key, payload
    ) VALUES (
      NEW.merchant_id, 'inventory-alerts',
      'inventory-email:' || NEW.id::text || ':' || v_episode::text || ':' || v_new_state,
      jsonb_build_object(
        'channel', 'email', 'to', v_settings.notification_email,
        'subject', CASE WHEN v_new_state = 'out'
          THEN 'Muin out-of-stock alert' ELSE 'Muin low-stock alert' END,
        'text', NEW.name || ' now has ' || v_available || ' available in Muin.',
        'product_id', NEW.id,
        'severity', CASE WHEN v_new_state = 'out' THEN 'critical' ELSE 'medium' END
      )
    ) ON CONFLICT (merchant_id, idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_inventory_threshold ON products;
CREATE TRIGGER trg_products_inventory_threshold
  AFTER INSERT OR UPDATE OF quantity_total, quantity_reserved, low_stock_threshold, is_active
  ON products
  FOR EACH ROW EXECUTE FUNCTION handle_inventory_threshold_crossing();
