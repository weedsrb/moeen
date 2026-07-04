-- ============================================================
-- Migration 017: Exclude AI proposals from order KPIs
-- ============================================================
--
-- Migration 015 introduced the `ai_proposal` status: a below-threshold AI
-- extraction is now parked as a *proposal* the merchant explicitly confirms
-- (-> incoming) or rejects (-> cancelled) rather than minting a live order.
-- Two order aggregations were written before that status existed and still
-- count proposals as if they were real orders:
--
--   1. merchants.monthly_order_count (quota usage) — incremented on EVERY
--      order INSERT, so an unreviewed AI guess burns quota the merchant never
--      agreed to.
--   2. dashboard_metrics()'s status-agnostic `today_orders` / `yesterday_orders`
--      tiles — they count all rows regardless of status, so proposals inflate
--      the merchant's daily order trend.
--
-- The per-status dashboard tiles (incoming_orders, pending_orders, ...) are
-- already correct: they filter on a concrete status and `ai_proposal` is not
-- one of them, so proposals never leak into those counts.
--
-- Quota semantics after this migration: a proposal consumes quota at the
-- moment it becomes a *real* order (merchant confirms it: ai_proposal ->
-- incoming), NOT when it is created and NOT when it is rejected
-- (ai_proposal -> cancelled). This keeps quota aligned with orders the
-- merchant actually accepted.

-- ------------------------------------------------------------
-- 1. Quota: don't count proposals until they're confirmed
-- ------------------------------------------------------------
--
-- 1a. INSERT trigger: skip proposals entirely. A brand-new order still bumps
--     the counter, but a freshly created `ai_proposal` does not — it is not a
--     real order yet. Adding `SET search_path TO 'public'` also clears the
--     mutable-search-path security advisor the original function tripped.

CREATE OR REPLACE FUNCTION public.increment_monthly_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- A proposal is not yet a real order — quota is consumed later, when the
  -- merchant confirms it (handled by promote_proposal_order_count()).
  IF NEW.status = 'ai_proposal' THEN
    RETURN NEW;
  END IF;

  UPDATE merchants
  SET monthly_order_count = monthly_order_count + 1,
      updated_at = now()
  WHERE id = NEW.merchant_id;
  RETURN NEW;
END;
$function$;

-- 1b. UPDATE trigger: consume quota the moment a proposal is promoted into a
--     real order. `OLD.status = 'ai_proposal' AND NEW.status <> 'ai_proposal'`
--     fires on BOTH confirm (-> incoming) and reject (-> cancelled), so we
--     additionally guard on `NEW.status <> 'cancelled'`: a rejected proposal
--     never became a real order and must never burn quota.

CREATE OR REPLACE FUNCTION public.promote_proposal_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only the proposal -> real-order transition consumes quota. Confirming a
  -- proposal (ai_proposal -> incoming, etc.) counts it exactly once here,
  -- because the original INSERT deliberately skipped it. Rejection
  -- (ai_proposal -> cancelled) leaves quota untouched.
  IF OLD.status = 'ai_proposal'
     AND NEW.status <> 'ai_proposal'
     AND NEW.status <> 'cancelled' THEN
    UPDATE merchants
    SET monthly_order_count = monthly_order_count + 1,
        updated_at = now()
    WHERE id = NEW.merchant_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_promote_proposal_order_count ON orders;

CREATE TRIGGER trg_promote_proposal_order_count
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION promote_proposal_order_count();

-- ------------------------------------------------------------
-- 2. Dashboard: exclude proposals from today/yesterday order counts
-- ------------------------------------------------------------
--
-- Full body reproduced verbatim from migration 010; the ONLY change is
-- appending `AND status <> 'ai_proposal'` to the two status-agnostic
-- subqueries (`today_orders`, `yesterday_orders`). Every other line —
-- auth check, per-status tiles, message counts, delivered counts — is
-- unchanged.

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
    'pending_orders',      (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'pending'),
    'confirmed_orders',    (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'confirmed'),
    'delivery_orders',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'out_for_delivery'),
    'open_flags',          (SELECT count(*) FROM flags    WHERE merchant_id = p_merchant_id AND is_resolved = false),
    'today_messages',      (SELECT count(*) FROM messages WHERE merchant_id = p_merchant_id AND direction = 'inbound' AND created_at >= v_today),
    'today_orders',        (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_today AND status <> 'ai_proposal'),
    'today_delivered',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_today),
    'yesterday_messages',  (SELECT count(*) FROM messages WHERE merchant_id = p_merchant_id AND direction = 'inbound' AND created_at >= v_yesterday_start AND created_at < v_yesterday_end),
    'yesterday_orders',    (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_yesterday_start AND created_at < v_yesterday_end AND status <> 'ai_proposal'),
    'yesterday_delivered', (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_yesterday_start AND delivered_at < v_yesterday_end)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION dashboard_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dashboard_metrics(uuid) TO authenticated;
