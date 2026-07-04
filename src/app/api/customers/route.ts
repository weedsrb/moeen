import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { createCustomerInlineSchema } from "@/lib/validations/order";
import type { OrderCustomerLite } from "@/types/order";

export async function GET(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  let query = supabase
    .from("customers")
    .select("id, name, phone, platform")
    .eq("merchant_id", auth.merchant.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    customers: (data ?? []) as OrderCustomerLite[],
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const body = await request.json();
  const parsed = createCustomerInlineSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      merchant_id: auth.merchant.id,
      platform: "manual",
      platform_user_id: `manual:${crypto.randomUUID()}`,
      name: parsed.data.name,
      phone: parsed.data.phone,
      delivery_address: parsed.data.delivery_address ?? null,
    })
    .select("id, name, phone, platform")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer }, { status: 201 });
}
