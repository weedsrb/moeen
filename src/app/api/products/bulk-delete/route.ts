import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkIdsSchema } from "@/lib/validations/product";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

/**
 * Permanently delete products (hard delete) — distinct from deactivating, which
 * only flips is_active. A product that appears in any order can't be removed
 * (order_items refs it, and order history must survive), so those ids are
 * filtered out and reported back as `blocked` rather than failing the whole
 * batch. The caller tells the merchant to deactivate those instead.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const merchantId = auth.merchant.id;

  const supabase = await createClient();

  const body = await request.json();
  const parsed = bulkIdsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const ids = parsed.data.ids;

  // Which of these products are referenced by an order? Those can't be purged.
  const { data: referencedRows, error: refError } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("merchant_id", merchantId)
    .in("product_id", ids);

  if (refError) {
    return NextResponse.json({ error: refError.message }, { status: 500 });
  }

  const blocked = [
    ...new Set(
      (referencedRows ?? [])
        .map((r) => r.product_id)
        .filter((pid): pid is string => pid !== null)
    ),
  ];
  const deletable = ids.filter((id) => !blocked.includes(id));

  let deleted = 0;
  if (deletable.length > 0) {
    const { data, error } = await supabase
      .from("products")
      .delete()
      .in("id", deletable)
      .eq("merchant_id", merchantId)
      .select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    deleted = data?.length ?? 0;
  }

  return NextResponse.json({ deleted, blocked });
}
