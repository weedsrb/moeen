import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createFAQSchema, MAX_FAQ_ENTRIES } from "@/lib/validations/ai-settings";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function GET() {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("merchant_faq")
    .select("id, question, answer, display_order")
    .eq("merchant_id", auth.merchant.id)
    .order("display_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ faq: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const body = await request.json();
  const parsed = createFAQSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { count, error: countError } = await supabase
    .from("merchant_faq")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", auth.merchant.id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) >= MAX_FAQ_ENTRIES) {
    return NextResponse.json(
      {
        error: `FAQ limit reached (max ${MAX_FAQ_ENTRIES} entries). Delete an entry before adding more.`,
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("merchant_faq")
    .insert({
      merchant_id: auth.merchant.id,
      question: parsed.data.question,
      answer: parsed.data.answer,
      display_order: parsed.data.display_order ?? 0,
    })
    .select("id, question, answer, display_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ faq: data }, { status: 201 });
}
