-- ============================================================
-- Migration 010: Phase 5 order management
-- ============================================================

-- ------------------------------------------------------------
-- 1. Atomic MO-000001 order numbers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_order_number(p_merchant_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_num integer;
BEGIN
  -- Per-merchant advisory lock prevents race on concurrent inserts
  PERFORM pg_advisory_xact_lock(hashtext('order_number:' || p_merchant_id::text));

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 4) AS integer)
  ), 0) + 1
  INTO next_num
  FROM orders
  WHERE merchant_id = p_merchant_id
    AND order_number ~ '^MO-[0-9]+$';

  RETURN 'MO-' || LPAD(next_num::text, 6, '0');
END;
$$;

-- ------------------------------------------------------------
-- 2. Manual order RPC
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_manual_order(
  p_merchant_id uuid,
  p_customer_id uuid,
  p_conversation_id uuid,
  p_delivery_address text,
  p_notes text,
  p_currency text,
  p_items jsonb
)
RETURNS TABLE(order_id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric := 0;
  v_item jsonb;
BEGIN
  -- Verify caller owns merchant (via auth.uid())
  IF NOT EXISTS (
    SELECT 1 FROM merchants WHERE id = p_merchant_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Compute subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_subtotal := v_subtotal
      + (v_item->>'quantity')::int * (v_item->>'unit_price')::numeric;
  END LOOP;

  v_order_number := generate_order_number(p_merchant_id);

  INSERT INTO orders (
    merchant_id, customer_id, conversation_id, order_number,
    status, delivery_address, subtotal, total, currency, notes,
    ai_confidence, ai_extracted, source_message_id
  ) VALUES (
    p_merchant_id, p_customer_id, p_conversation_id, v_order_number,
    'pending', p_delivery_address, v_subtotal, v_subtotal, p_currency, p_notes,
    NULL, false, NULL
  ) RETURNING id INTO v_order_id;

  INSERT INTO order_items (
    merchant_id, order_id, product_id, product_name, variant,
    quantity, unit_price, subtotal, ai_confidence, ai_matched
  )
  SELECT
    p_merchant_id, v_order_id,
    NULLIF(elem->>'product_id', '')::uuid,
    elem->>'product_name',
    elem->>'variant',
    (elem->>'quantity')::int,
    (elem->>'unit_price')::numeric,
    (elem->>'quantity')::int * (elem->>'unit_price')::numeric,
    NULL, false
  FROM jsonb_array_elements(p_items) elem;

  INSERT INTO order_timeline (merchant_id, order_id, from_status, to_status, changed_by, note)
  VALUES (p_merchant_id, v_order_id, NULL, 'pending', 'merchant', 'Manual order created');

  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;

GRANT EXECUTE ON FUNCTION create_manual_order(uuid, uuid, uuid, text, text, text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 3. Inventory status transition triggers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_inventory_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only act when status actually changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- incoming -> pending: reserve
  IF OLD.status = 'incoming' AND NEW.status = 'pending' THEN
    UPDATE products p
    SET quantity_reserved = p.quantity_reserved + oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  -- pending -> incoming: release reservation
  IF OLD.status = 'pending' AND NEW.status = 'incoming' THEN
    UPDATE products p
    SET quantity_reserved = p.quantity_reserved - oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  -- pending -> confirmed: deduct and clear reservation
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    UPDATE products p
    SET quantity_total = p.quantity_total - oi.quantity,
        quantity_reserved = p.quantity_reserved - oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  -- incoming -> confirmed: deduct without reservation
  IF OLD.status = 'incoming' AND NEW.status = 'confirmed' THEN
    UPDATE products p
    SET quantity_total = p.quantity_total - oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  -- pending -> cancelled: release reservation
  IF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
    UPDATE products p
    SET quantity_reserved = p.quantity_reserved - oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  -- confirmed/out_for_delivery/delivered -> cancelled: restore stock
  IF OLD.status IN ('confirmed', 'out_for_delivery', 'delivered')
     AND NEW.status = 'cancelled' THEN
    UPDATE products p
    SET quantity_total = p.quantity_total + oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_inventory_on_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    UPDATE products p
    SET quantity_reserved = p.quantity_reserved + oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  IF NEW.status = 'confirmed' THEN
    UPDATE products p
    SET quantity_total = p.quantity_total - oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reserve_inventory_on_insert ON orders;

CREATE CONSTRAINT TRIGGER trg_reserve_inventory_on_insert
  AFTER INSERT ON orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION reserve_inventory_on_order_insert();

-- ------------------------------------------------------------
-- 4. Dashboard trends
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION dashboard_metrics(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today timestamptz := date_trunc('day', now());
  v_yesterday_start timestamptz := now() - interval '48 hours';
  v_yesterday_end timestamptz := now() - interval '24 hours';
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM merchants
    WHERE id = p_merchant_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'incoming_orders',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'incoming'),
    'pending_orders',      (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'pending'),
    'confirmed_orders',    (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'confirmed'),
    'delivery_orders',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'out_for_delivery'),
    'open_flags',          (SELECT count(*) FROM flags    WHERE merchant_id = p_merchant_id AND is_resolved = false),
    'today_messages',      (SELECT count(*) FROM messages WHERE merchant_id = p_merchant_id AND direction = 'inbound' AND created_at >= v_today),
    'today_orders',        (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_today),
    'today_delivered',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_today),
    'yesterday_messages',  (SELECT count(*) FROM messages WHERE merchant_id = p_merchant_id AND direction = 'inbound' AND created_at >= v_yesterday_start AND created_at < v_yesterday_end),
    'yesterday_orders',    (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_yesterday_start AND created_at < v_yesterday_end),
    'yesterday_delivered', (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_yesterday_start AND delivered_at < v_yesterday_end)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION dashboard_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dashboard_metrics(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5. Timeline lookup index
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_order_timeline_order_created
  ON order_timeline(order_id, created_at DESC);
