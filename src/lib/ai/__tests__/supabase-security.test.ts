import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase AI and automation security hardening", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "038_supabase_security_hardening.sql"
    ),
    "utf8"
  );

  it("keeps anonymous callers away from authenticated definer RPCs", () => {
    expect(migration).toContain(
      "FROM PUBLIC, anon, authenticated"
    );
    expect(migration).toContain(
      "TO authenticated, service_role"
    );
  });

  it.each([
    "handle_inventory_threshold_crossing",
    "notify_new_incoming_order",
    "resolve_customer_wait_on_outbound",
    "resolve_stale_order_on_transition",
    "update_inventory_on_status_change",
    "reserve_inventory_on_order_insert",
  ])("revokes direct execution of trigger function %s", (functionName) => {
    expect(migration).toContain(`FUNCTION ${functionName}()`);
  });

  it("pins all advisor-reported mutable search paths", () => {
    expect(migration.match(/SET search_path = public/g)).toHaveLength(9);
  });

  it("removes broad object-listing policies from public buckets", () => {
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Chat media is publicly readable"'
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Product images are publicly readable"'
    );
  });
});

