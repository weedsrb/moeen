import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateAISettingsSchema } from "@/lib/validations/ai-settings";

async function getAuthenticatedMerchant() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, merchant: null };

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  return { supabase, user, merchant };
}

export async function GET() {
  const { supabase, user, merchant } = await getAuthenticatedMerchant();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });

  const [settingsResult, faqResult] = await Promise.all([
    supabase
      .from("merchant_settings")
      .select("ai_confidence_threshold, ai_auto_clarify, ai_handoff_message, ai_persona_name, ai_tone, ai_greeting, ai_business_context, ai_custom_instructions, ai_response_language, ai_auto_acknowledge, ai_acknowledge_template")
      .eq("merchant_id", merchant.id)
      .single(),

    supabase
      .from("merchant_faq")
      .select("id, question, answer, display_order")
      .eq("merchant_id", merchant.id)
      .order("display_order"),
  ]);

  return NextResponse.json({
    settings: settingsResult.data,
    faq: faqResult.data ?? [],
  });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, merchant } = await getAuthenticatedMerchant();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });

  const body = await request.json();
  const parsed = updateAISettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("merchant_settings")
    .update(parsed.data)
    .eq("merchant_id", merchant.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
