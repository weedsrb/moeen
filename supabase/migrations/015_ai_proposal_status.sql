-- ============================================================
-- Migration 015: AI proposal order status
-- ============================================================
--
-- Introduces the `ai_proposal` order status. A below-threshold AI
-- extraction (pipeline Case D) is now parked as a *proposal* that the
-- merchant explicitly confirms (-> incoming) or rejects (-> cancelled),
-- instead of silently minting a live `incoming` order and polluting the
-- order stats with unreviewed AI guesses. This is the "AI suggests, the
-- merchant decides" principle applied to low-confidence extractions.

-- ------------------------------------------------------------
-- 1. Status CHECK constraint
-- ------------------------------------------------------------
--
-- `orders.status` had no CHECK constraint before now — valid values were
-- only enforced at the app layer (the Zod `orderStatusSchema` enum + the
-- `ORDER_ALLOWED_TRANSITIONS` map). We codify the full lifecycle here,
-- INCLUDING the new `ai_proposal` value, so the database itself rejects
-- unknown statuses. Every existing row already uses one of the six
-- original statuses, so the constraint validates without violation.

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'ai_proposal',
    'incoming',
    'pending',
    'confirmed',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ));

-- ------------------------------------------------------------
-- 2. Inventory triggers: NO change required for `ai_proposal`
-- ------------------------------------------------------------
--
-- update_inventory_on_status_change() (migration 010) only mutates stock
-- on these OLD -> NEW transitions:
--   incoming                             -> pending    (reserve)
--   pending                              -> incoming   (release)
--   pending                              -> confirmed  (deduct + release)
--   incoming                             -> confirmed  (deduct)
--   pending                              -> cancelled  (release)
--   confirmed/out_for_delivery/delivered -> cancelled  (restore)
--
-- No branch has OLD.status = 'ai_proposal', therefore:
--   * ai_proposal -> incoming  is a no-op. The order then behaves exactly
--     like a freshly created `incoming` order (which also reserves
--     nothing — reservation only happens later on incoming -> pending).
--   * ai_proposal -> cancelled is a no-op. Nothing is ever reserved or
--     deducted for a proposal, so there is nothing to release/restore.
--
-- reserve_inventory_on_order_insert() only reserves/deducts for
-- NEW.status IN ('pending','confirmed'); an `ai_proposal` insert touches
-- no stock. An explicit `ai_proposal` guard is therefore unnecessary and
-- no trigger is modified in this migration.
