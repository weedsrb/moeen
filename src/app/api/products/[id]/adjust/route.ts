import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stockAdjustmentSchema } from "@/lib/validations/product";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const merchant = auth.merchant;

  const supabase = await createClient();

  const body = await request.json();
  const parsed = stockAdjustmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data: product, error: fetchError } = await supabase
    .from("products")
    .select("quantity_total, merchant_id")
    .eq("id", id)
    .single();

  if (fetchError || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (product.merchant_id !== merchant.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const previousQuantity = product.quantity_total;
  const newQuantity = previousQuantity + parsed.data.adjustment;

  if (newQuantity < 0) {
    return NextResponse.json(
      {
        error: `Cannot reduce stock below 0. Current: ${previousQuantity}, adjustment: ${parsed.data.adjustment}`,
      },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ quantity_total: newQuantity })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: adjustment, error: logError } = await supabase
    .from("stock_adjustments")
    .insert({
      merchant_id: merchant.id,
      product_id: id,
      adjustment: parsed.data.adjustment,
      reason: parsed.data.reason,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity,
    })
    .select()
    .single();

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  return NextResponse.json({ adjustment, new_quantity: newQuantity });
}
