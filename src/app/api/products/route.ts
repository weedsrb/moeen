import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProductSchema } from "@/lib/validations/product";
import { PRODUCT_COLUMNS } from "@/lib/db/columns";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function GET() {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("merchant_id", auth.merchant.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: products ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const body = await request.json();
  const parsed = createProductSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      merchant_id: auth.merchant.id,
      name: parsed.data.name,
      price: parsed.data.price,
      currency: parsed.data.currency,
      quantity_total: parsed.data.quantity_total,
      description: parsed.data.description ?? null,
      alternative_names: parsed.data.alternative_names ?? [],
      low_stock_threshold: parsed.data.low_stock_threshold ?? null,
      variants: parsed.data.variants ?? null,
      image_url: parsed.data.image_url ?? null,
      is_active: parsed.data.is_active,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product }, { status: 201 });
}
