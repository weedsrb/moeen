-- ============================================================
-- Migration 009: Performance indexes + dashboard_metrics RPC
-- ============================================================
--
-- Adds composite/partial indexes that cover the exact filter+sort
-- shape of every current list query, and introduces a single
-- SECURITY DEFINER function that returns all dashboard KPI counts
-- in one round trip (replacing 8 separate count queries).
--
-- All CREATE statements use IF NOT EXISTS so this migration is
-- idempotent. No existing indexes are dropped — the planner will
-- pick whichever is cheapest; redundant narrower indexes can be
-- removed in a later cleanup migration once measured.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Indexes
-- ------------------------------------------------------------

-- Orders: filter by status + order by created_at DESC (KPI counts,
-- list pages with status filter). Prefix match (merchant_id, status)
-- also serves the 4 order-status counts in dashboard_metrics.
CREATE INDEX IF NOT EXISTS idx_orders_merchant_status_created
  ON orders (merchant_id, status, created_at DESC);

-- Order items: lookups by parent order (order detail page, RPC joins).
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id);

-- Messages: merchant-scoped conversation threads ordered by time.
CREATE INDEX IF NOT EXISTS idx_messages_merchant_conv_created
  ON messages (merchant_id, conversation_id, created_at DESC);

-- Messages with an order signal (partial — AI pipeline reverse lookup).
CREATE INDEX IF NOT EXISTS idx_messages_order_signal
  ON messages (merchant_id, has_order_signal)
  WHERE has_order_signal = true;

-- Flags: filter by is_resolved + priority, order by created_at DESC.
-- Covers the flags page query exactly.
CREATE INDEX IF NOT EXISTS idx_flags_merchant_resolved_priority_created
  ON flags (merchant_id, is_resolved, priority, created_at DESC);

-- Products: filter by is_active, order by created_at DESC. Covers
-- /inventory server fetch and /api/products GET.
CREATE INDEX IF NOT EXISTS idx_products_merchant_active_created
  ON products (merchant_id, is_active, created_at DESC);

-- ------------------------------------------------------------
-- 2. dashboard_metrics RPC
-- ------------------------------------------------------------
--
-- Returns all KPI counts the dashboard displays in one call:
--   * 4 order counts by status (incoming/pending/confirmed/out_for_delivery)
--   * open flags count
--   * today's inbound messages / orders created / orders delivered
--
-- Security model: SECURITY DEFINER so the function can bypass the
-- 8 per-subquery RLS checks, but we enforce a manual ownership check
-- up-front: the caller's auth.uid() must match the merchant's owner.
-- Anonymous / service-role callers do not have auth.uid() and are
-- rejected. Explicit REVOKE PUBLIC + GRANT authenticated restricts
-- who can invoke.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION dashboard_metrics(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today timestamptz := date_trunc('day', now());
  v_result jsonb;
BEGIN
  -- Ownership check: caller must own p_merchant_id.
  IF NOT EXISTS (
    SELECT 1 FROM merchants
    WHERE id = p_merchant_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'incoming_orders',  (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'incoming'),
    'pending_orders',   (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'pending'),
    'confirmed_orders', (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'confirmed'),
    'delivery_orders',  (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'out_for_delivery'),
    'open_flags',       (SELECT count(*) FROM flags    WHERE merchant_id = p_merchant_id AND is_resolved = false),
    'today_messages',   (SELECT count(*) FROM messages WHERE merchant_id = p_merchant_id AND direction = 'inbound' AND created_at >= v_today),
    'today_orders',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_today),
    'today_delivered',  (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_today)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION dashboard_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dashboard_metrics(uuid) TO authenticated;
