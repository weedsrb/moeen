import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { updateAutomationSettingsSchema } from "@/lib/validations/automation-settings";

export async function GET() {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("merchant_automation_settings")
    .select("*")
    .eq("merchant_id", auth.merchant.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const parsed = updateAutomationSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid settings" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("merchant_automation_settings")
    .select("notification_email, email_verified_at")
    .eq("merchant_id", auth.merchant.id)
    .maybeSingle();
  const emailChanged =
    current?.notification_email !== parsed.data.notification_email;
  const emailVerifiedAt = emailChanged ? null : current?.email_verified_at ?? null;

  const { data, error } = await supabase
    .from("merchant_automation_settings")
    .upsert(
      {
        merchant_id: auth.merchant.id,
        ...parsed.data,
        email_verified_at: emailVerifiedAt,
        email_enabled: parsed.data.email_enabled && Boolean(emailVerifiedAt),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "merchant_id" }
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
