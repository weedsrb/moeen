-- ============================================================
-- Migration 020: Order lifecycle v2 — 6 statuses
-- ============================================================
--
-- Collapses the 8-status lifecycle down to 6. Two statuses are retired:
--
--   * `ai_proposal` — dead since Phase 4.6. createOrderFromAI() (the only
--     function that could create one) has zero callers; the `collecting`
--     draft flow superseded it. Any existing `ai_proposal` rows are
--     abandoned/dormant drafts, not orders anyone is actively working.
--
--   * `pending` — Phase 4.6's finalize gate already requires explicit
--     customer confirmation before an order ever reaches `incoming`, so a
--     separate merchant-side "has the customer confirmed?" step no longer
--     answers a live question. It was also used inconsistently:
--     AI-created orders start at `incoming`, but create_manual_order()
--     hardcoded `pending`.
--
-- New model: collecting -> incoming -> confirmed -> out_for_delivery ->
-- delivered, with cancelled reachable from any non-terminal state.
--
-- Stock reservation moves one stage earlier: `incoming` now reserves stock
-- (previously only `pending` did — `incoming` reserved nothing). `confirmed`
-- still deducts and clears the reservation; only the origin status of the
-- "reserve" step changes.

-- ------------------------------------------------------------
-- 1. Backfill reservations for existing `incoming` orders
-- ------------------------------------------------------------
--
-- Must run BEFORE any status renaming below, while `status = 'incoming'`
-- still unambiguously means "was incoming pre-migration". Existing `pending`
-- orders already hold a reservation and are deliberately excluded here —
-- they're folded into `incoming` untouched in step 3, so no double-reserve.

UPDATE products p
SET quantity_reserved = p.quantity_reserved + sub.qty,
    updated_at = now()
FROM (
  SELECT oi.product_id, SUM(oi.quantity) AS qty
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status = 'incoming'
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
) sub
WHERE p.id = sub.product_id;

-- ------------------------------------------------------------
-- 2. Capture ids of orders about to be renamed, for the audit trail
-- ------------------------------------------------------------
--
-- Once step 3 renames these rows we can no longer tell what they used to
-- be, so snapshot the ids first.

CREATE TEMP TABLE _migrate_pending AS
  SELECT id, merchant_id FROM orders WHERE status = 'pending';

CREATE TEMP TABLE _migrate_proposal AS
  SELECT id, merchant_id FROM orders WHERE status = 'ai_proposal';

-- ------------------------------------------------------------
-- 3. Collapse statuses
-- ------------------------------------------------------------
--
-- The inventory trigger is disabled for this step: its current logic keys
-- off OLD/NEW status *pairs* from the 8-status world (e.g. it would read
-- `pending -> incoming` as "release the reservation", which is wrong here —
-- these orders keep their existing reservation, they're just being
-- relabeled). Step 6 rewrites the trigger for the new 6-status lifecycle.

ALTER TABLE orders DISABLE TRIGGER trg_update_inventory_on_status_change;

-- pending -> incoming: already reserved (see step 1's exclusion), no stock change.
UPDATE orders SET status = 'incoming', updated_at = now()
WHERE id IN (SELECT id FROM _migrate_pending);

-- ai_proposal -> cancelled: dormant/abandoned drafts, never reserved or deducted.
UPDATE orders SET status = 'cancelled', updated_at = now()
WHERE id IN (SELECT id FROM _migrate_proposal);

ALTER TABLE orders ENABLE TRIGGER trg_update_inventory_on_status_change;

-- ------------------------------------------------------------
-- 4. Audit trail for the migrated rows
-- ------------------------------------------------------------
--
-- order_timeline.from_status/to_status are plain `text` columns with no
-- CHECK constraint (migration 001), so historical values outside the new
-- 6-value set are safe to keep.

INSERT INTO order_timeline (merchant_id, order_id, from_status, to_status, changed_by, note)
SELECT merchant_id, id, 'pending', 'incoming', 'system',
       'Auto-migrated: pending status retired (order lifecycle v2)'
FROM _migrate_pending;

INSERT INTO order_timeline (merchant_id, order_id, from_status, to_status, changed_by, note)
SELECT merchant_id, id, 'ai_proposal', 'cancelled', 'system',
       'Auto-migrated: ai_proposal status retired (order lifecycle v2)'
FROM _migrate_proposal;

DROP TABLE _migrate_pending;
DROP TABLE _migrate_proposal;

-- ------------------------------------------------------------
-- 5. Status CHECK constraint: 6 values
-- ------------------------------------------------------------

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'collecting',
    'incoming',
    'confirmed',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ));

-- ------------------------------------------------------------
-- 6. Inventory triggers: reservation moves to `incoming`
-- ------------------------------------------------------------
--
-- The only UPDATE transition that ever lands on `incoming` under the new
-- ORDER_ALLOWED_TRANSITIONS is `collecting -> incoming`. A manual order is
-- INSERTed directly as `incoming` (reserve_inventory_on_order_insert()
-- below handles that path, not this one).

CREATE OR REPLACE FUNCTION update_inventory_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- collecting -> incoming: reserve
  IF OLD.status = 'collecting' AND NEW.status = 'incoming' THEN
    UPDATE products p
    SET quantity_reserved = p.quantity_reserved + oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  -- incoming -> confirmed: deduct and clear reservation
  IF OLD.status = 'incoming' AND NEW.status = 'confirmed' THEN
    UPDATE products p
    SET quantity_total = p.quantity_total - oi.quantity,
        quantity_reserved = p.quantity_reserved - oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.product_id = p.id;
  END IF;

  -- incoming -> cancelled: release reservation
  IF OLD.status = 'incoming' AND NEW.status = 'cancelled' THEN
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
  IF NEW.status = 'incoming' THEN
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

-- ------------------------------------------------------------
-- 7. create_manual_order: start manual orders at `incoming` (was `pending`)
-- ------------------------------------------------------------
--
-- Matches the AI-created path (also starts at `incoming`) and now reserves
-- stock immediately via reserve_inventory_on_order_insert() above.

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
  IF NOT EXISTS (
    SELECT 1 FROM merchants WHERE id = p_merchant_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

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
    'incoming', p_delivery_address, v_subtotal, v_subtotal, p_currency, p_notes,
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
  VALUES (p_merchant_id, v_order_id, NULL, 'incoming', 'merchant', 'Manual order created');

  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;

GRANT EXECUTE ON FUNCTION create_manual_order(uuid, uuid, uuid, text, text, text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 8. Quota triggers: only `collecting` remains a pre-order staging state
-- ------------------------------------------------------------
--
-- Full bodies reproduced from migration 019; the only change is dropping
-- `ai_proposal` from the checks (it can no longer exist after step 5's
-- constraint change).

CREATE OR REPLACE FUNCTION public.increment_monthly_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- An in-progress collecting order is not yet a real order — quota is
  -- consumed later, when it graduates into a real order (handled by
  -- promote_proposal_order_count()).
  IF NEW.status = 'collecting' THEN
    RETURN NEW;
  END IF;

  UPDATE merchants
  SET monthly_order_count = monthly_order_count + 1,
      updated_at = now()
  WHERE id = NEW.merchant_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_proposal_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only the collecting -> real-order transition consumes quota. Graduating
  -- (-> incoming) counts it exactly once here, because the original INSERT
  -- deliberately skipped it. Cancellation (collecting -> cancelled) leaves
  -- quota untouched.
  IF OLD.status = 'collecting'
     AND NEW.status <> 'collecting'
     AND NEW.status <> 'cancelled' THEN
    UPDATE merchants
    SET monthly_order_count = monthly_order_count + 1,
        updated_at = now()
    WHERE id = NEW.merchant_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger unchanged (recreated idempotently); still bound to the same
-- promote_proposal_order_count() function.
DROP TRIGGER IF EXISTS trg_promote_proposal_order_count ON orders;

CREATE TRIGGER trg_promote_proposal_order_count
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION promote_proposal_order_count();

-- ------------------------------------------------------------
-- 9. Dashboard: drop `pending_orders`, simplify staging-state exclusion
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dashboard_metrics(p_merchant_id uuid)
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
    'confirmed_orders',    (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'confirmed'),
    'delivery_orders',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'out_for_delivery'),
    'open_flags',          (SELECT count(*) FROM flags    WHERE merchant_id = p_merchant_id AND is_resolved = false),
    'today_messages',      (SELECT count(*) FROM messages WHERE merchant_id = p_merchant_id AND direction = 'inbound' AND created_at >= v_today),
    'today_orders',        (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_today AND status <> 'collecting'),
    'today_delivered',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_today),
    'yesterday_messages',  (SELECT count(*) FROM messages WHERE merchant_id = p_merchant_id AND direction = 'inbound' AND created_at >= v_yesterday_start AND created_at < v_yesterday_end),
    'yesterday_orders',    (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_yesterday_start AND created_at < v_yesterday_end AND status <> 'collecting'),
    'yesterday_delivered', (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_yesterday_start AND delivered_at < v_yesterday_end)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION dashboard_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dashboard_metrics(uuid) TO authenticated;
