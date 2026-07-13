-- Multi-business support: allow one auth user to own multiple independent
-- merchant tenants. Each business remains fully independent (own customers,
-- orders, products, Instagram connection, settings) with a single owner —
-- no shared org/billing, no team members in this pass.
--
-- All child tables (customers, orders, products, conversations, etc.) are
-- already scoped by merchant_id only, never user_id directly, and RLS
-- policies on merchants/merchant_settings/child tables already use
-- `user_id = auth.uid()` / `merchant_id IN (SELECT id FROM merchants WHERE
-- user_id = auth.uid())`, both of which are already correct for a user
-- owning multiple merchant rows. No RLS changes are required — the only
-- structural blocker is this UNIQUE constraint.

ALTER TABLE merchants DROP CONSTRAINT merchants_user_id_key;

CREATE INDEX IF NOT EXISTS idx_merchants_user_id ON merchants (user_id);
