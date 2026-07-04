-- ============================================================
-- Migration 019: `collecting` order status
-- ============================================================
--
-- Introduces the `collecting` order status: an order the AI is still
-- actively taking, gathering details across a multi-turn chat, before it
-- graduates into a real `incoming` order. Like `ai_proposal` (migration
-- 015), a `collecting` order is not yet a real order — it reserves no
-- stock, burns no quota, and is excluded from the dashboard's daily order
-- counts until it graduates.
--
-- Where `ai_proposal` parks a *below-threshold* extraction for explicit
-- merchant review, `collecting` is the earlier, in-progress state while the
-- AI is mid-conversation still assembling the order. Both are pre-order
-- staging states and are treated identically by the quota and dashboard
-- aggregations that were written for `ai_proposal`.

-- ------------------------------------------------------------
-- 1. Status CHECK constraint: add `collecting`
-- ------------------------------------------------------------
--
-- Reproduces migration 015's constraint (drop + re-add) with `collecting`
-- inserted between `ai_proposal` and `incoming` — the 8 valid statuses now.

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'ai_proposal',
    'collecting',
    'incoming',
    'pending',
    'confirmed',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ));

-- ------------------------------------------------------------
-- 2. Quota: treat `collecting` exactly like `ai_proposal`
-- ------------------------------------------------------------
--
-- Full bodies reproduced from migration 017; the ONLY change is broadening
-- the proposal-only status checks to also cover `collecting`. Neither a
-- proposal nor a collecting order is a real order yet, so neither consumes
-- quota until it graduates into a real order.

-- 2a. INSERT trigger: skip both pre-order staging states. A brand-new order
--     still bumps the counter, but a freshly created `ai_proposal` or
--     `collecting` order does not — it is not a real order yet.

CREATE OR REPLACE FUNCTION public.increment_monthly_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- A proposal or an in-progress collecting order is not yet a real order —
  -- quota is consumed later, when it graduates into a real order (handled by
  -- promote_proposal_order_count()).
  IF NEW.status IN ('ai_proposal', 'collecting') THEN
    RETURN NEW;
  END IF;

  UPDATE merchants
  SET monthly_order_count = monthly_order_count + 1,
      updated_at = now()
  WHERE id = NEW.merchant_id;
  RETURN NEW;
END;
$function$;

-- 2b. UPDATE trigger: consume quota the moment a pre-order staging state is
--     promoted into a real order. `OLD.status IN ('ai_proposal','collecting')
--     AND NEW.status NOT IN ('ai_proposal','collecting')` fires on graduation
--     (e.g. collecting -> incoming, ai_proposal -> incoming) AND on cancel, so
--     we additionally guard on `NEW.status <> 'cancelled'`: a cancelled staging
--     order never became a real order and must never burn quota. A
--     collecting -> ai_proposal (or the reverse) transition stays within the
--     staging states and is correctly NOT counted.

CREATE OR REPLACE FUNCTION public.promote_proposal_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only the staging -> real-order transition consumes quota. Graduating a
  -- proposal or collecting order (e.g. -> incoming) counts it exactly once
  -- here, because the original INSERT deliberately skipped it. Cancellation
  -- (ai_proposal/collecting -> cancelled) leaves quota untouched, as does a
  -- transition between the two staging states (ai_proposal <-> collecting).
  IF OLD.status IN ('ai_proposal', 'collecting')
     AND NEW.status NOT IN ('ai_proposal', 'collecting')
     AND NEW.status <> 'cancelled' THEN
    UPDATE merchants
    SET monthly_order_count = monthly_order_count + 1,
        updated_at = now()
    WHERE id = NEW.merchant_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger unchanged from migration 017 (recreated idempotently for a clean
-- re-run; still bound to the same promote_proposal_order_count() function).
DROP TRIGGER IF EXISTS trg_promote_proposal_order_count ON orders;

CREATE TRIGGER trg_promote_proposal_order_count
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION promote_proposal_order_count();

-- ------------------------------------------------------------
-- 3. Dashboard: exclude `collecting` from today/yesterday order counts
-- ------------------------------------------------------------
--
-- Full body reproduced verbatim from migration 017; the ONLY change is
-- broadening `AND status <> 'ai_proposal'` to `AND status NOT IN
-- ('ai_proposal','collecting')` on the two status-agnostic subqueries
-- (`today_orders`, `yesterday_orders`). Every other line — auth check,
-- per-status tiles, message counts, delivered counts, REVOKE/GRANT — is
-- unchanged. The per-status tiles already ignore `collecting` because it is
-- not one of the concrete statuses they filter on.

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
    'today_orders',        (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_today AND status NOT IN ('ai_proposal', 'collecting')),
    'today_delivered',     (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_today),
    'yesterday_messages',  (SELECT count(*) FROM messages WHERE merchant_id = p_merchant_id AND direction = 'inbound' AND created_at >= v_yesterday_start AND created_at < v_yesterday_end),
    'yesterday_orders',    (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND created_at >= v_yesterday_start AND created_at < v_yesterday_end AND status NOT IN ('ai_proposal', 'collecting')),
    'yesterday_delivered', (SELECT count(*) FROM orders   WHERE merchant_id = p_merchant_id AND status = 'delivered' AND delivered_at >= v_yesterday_start AND delivered_at < v_yesterday_end)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION dashboard_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dashboard_metrics(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4. orders.ai_collection_state: in-progress gathering metadata
-- ------------------------------------------------------------
--
-- Holds the AI's working state for a `collecting` order so a multi-turn
-- collection can resume across messages. Nullable; only populated while the
-- order is being actively assembled.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ai_collection_state jsonb;

COMMENT ON COLUMN orders.ai_collection_state IS
  'AI in-progress gathering metadata for a `collecting` order: a snapshot of '
  'which required fields are still missing, an awaiting_confirmation flag, and '
  'the last readback shown to the customer. NULL once the order graduates out '
  'of `collecting` (or when not applicable).';

-- ------------------------------------------------------------
-- 5. ai_decisions.decision_case: add collection lifecycle cases
-- ------------------------------------------------------------
--
-- Migration 016 defined `decision_case` as an inline CHECK, so Postgres
-- auto-named the constraint `ai_decisions_decision_case_check`. Drop and
-- re-add it, KEEPING all 8 existing values and ADDING the four new
-- collection-lifecycle cases.

ALTER TABLE ai_decisions
  DROP CONSTRAINT IF EXISTS ai_decisions_decision_case_check;

ALTER TABLE ai_decisions
  ADD CONSTRAINT ai_decisions_decision_case_check
  CHECK (decision_case IN (
    'ai_unavailable',
    'intent_other',
    'question_answered',
    'question_flagged',
    'order_auto_created',
    'order_clarify_sent',
    'order_created_flagged',
    'order_proposal_created',
    'order_collecting',
    'order_ready_to_confirm',
    'order_confirmed',
    'order_cancelled_by_customer'
  ));

-- ------------------------------------------------------------
-- 6. Inventory triggers: NO change required for `collecting`
-- ------------------------------------------------------------
--
-- Same reasoning as migration 015's `ai_proposal` (inventory triggers from
-- migration 010):
--   * reserve_inventory_on_order_insert() only reserves/deducts for
--     NEW.status IN ('pending','confirmed'); a `collecting` insert touches
--     no stock.
--   * update_inventory_on_status_change() has NO branch for OLD.status =
--     'collecting', so `collecting -> incoming` is a stock no-op. The order
--     then behaves exactly like a freshly created `incoming` order, which
--     also reserves nothing — reservation only happens later on
--     `incoming -> pending`.
-- Therefore no inventory trigger is modified in this migration.
