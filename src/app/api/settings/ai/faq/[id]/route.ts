import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateFAQSchema } from "@/lib/validations/ai-settings";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const { data: faqEntry } = await supabase
    .from("merchant_faq")
    .select("id, merchant_id")
    .eq("id", id)
    .single();

  if (!faqEntry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (faqEntry.merchant_id !== auth.merchant.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateFAQSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("merchant_faq")
    .update(parsed.data)
    .eq("id", id)
    .select("id, question, answer, display_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ faq: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const { data: faqEntry } = await supabase
    .from("merchant_faq")
    .select("id, merchant_id")
    .eq("id", id)
    .single();

  if (!faqEntry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (faqEntry.merchant_id !== auth.merchant.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("merchant_faq")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
