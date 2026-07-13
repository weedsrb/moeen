-- Harden functions exposed through Supabase's public schema. Supabase grants
-- EXECUTE on new public functions to API roles by default; trigger-only and
-- internal helper functions must not be callable as RPCs.

-- Pin every function reported by the database advisor to a non-user-controlled
-- search path. This is especially important for SECURITY DEFINER functions.
ALTER FUNCTION automation_is_quiet_hours(
  text, time without time zone, time without time zone, timestamptz
) SET search_path = public;
ALTER FUNCTION inventory_alert_state(integer, integer, boolean)
  SET search_path = public;
ALTER FUNCTION generate_order_number(uuid) SET search_path = public;
ALTER FUNCTION update_updated_at() SET search_path = public;
ALTER FUNCTION create_manual_order(uuid, uuid, uuid, text, text, text, jsonb)
  SET search_path = public;
ALTER FUNCTION update_inventory_on_status_change() SET search_path = public;
ALTER FUNCTION reserve_inventory_on_order_insert() SET search_path = public;
ALTER FUNCTION sync_legacy_ai_processing_status() SET search_path = public;
ALTER FUNCTION create_default_merchant_automation_settings()
  SET search_path = public;

-- These are the only authenticated SECURITY DEFINER RPCs in this group. Both
-- perform an explicit auth.uid() merchant-ownership check before reading or
-- writing tenant data. Anonymous callers remain forbidden.
REVOKE ALL ON FUNCTION create_manual_order(
  uuid, uuid, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_manual_order(
  uuid, uuid, uuid, text, text, text, jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION dashboard_metrics(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_metrics(uuid)
  TO authenticated, service_role;

-- Trigger-only functions execute through their existing triggers as the
-- function owner. API roles do not need direct RPC execution.
REVOKE ALL ON FUNCTION handle_inventory_threshold_crossing()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION notify_new_incoming_order()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION resolve_customer_wait_on_outbound()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION resolve_stale_order_on_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_inventory_on_status_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reserve_inventory_on_order_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_monthly_order_count()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION promote_proposal_order_count()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_updated_at()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_legacy_ai_processing_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_default_merchant_automation_settings()
  FROM PUBLIC, anon, authenticated;

-- Internal helpers are invoked by owner/service-role functions; exposing them
-- as public RPCs only increases the API surface.
REVOKE ALL ON FUNCTION automation_is_quiet_hours(
  text, time without time zone, time without time zone, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_alert_state(integer, integer, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION generate_order_number(uuid)
  FROM PUBLIC, anon, authenticated;

-- Public buckets already serve object URLs through the public object endpoint.
-- Broad storage.objects SELECT policies are unnecessary and allow bucket
-- listing through the data API.
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Product images are publicly readable" ON storage.objects;

