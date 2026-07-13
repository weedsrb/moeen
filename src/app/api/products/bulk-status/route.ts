import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkStatusSchema } from "@/lib/validations/product";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

/**
 * Batch set products' active flag — the one operation behind both "delete"
 * (is_active: false, i.e. archive) and "reactivate" (is_active: true). Never a
 * hard delete, so order_items references survive. Scoped to the merchant's own
 * products via merchant_id + RLS, so foreign ids are silently no-ops.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const body = await request.json();
  const parsed = bulkStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("products")
    .update({ is_active: parsed.data.is_active })
    .in("id", parsed.data.ids)
    .eq("merchant_id", auth.merchant.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: data?.length ?? 0 });
}
