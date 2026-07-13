import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function POST() {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("merchant_automation_settings")
    .select("notification_email")
    .eq("merchant_id", auth.merchant.id)
    .single();
  if (!settings?.notification_email) {
    return NextResponse.json(
      { error: "Save a notification email first" },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json(
      { error: "Email delivery is not configured" },
      { status: 503 }
    );
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `automation-test:${auth.merchant.id}:${settings.notification_email}`,
    },
    body: JSON.stringify({
      from,
      to: [settings.notification_email],
      subject: `Muin notifications for ${auth.merchant.business_name}`,
      text: "Your Muin merchant notification email is working. Email alerts are now enabled.",
    }),
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: "Test email could not be delivered" },
      { status: 502 }
    );
  }

  const verifiedAt = new Date().toISOString();
  const { error } = await supabase
    .from("merchant_automation_settings")
    .update({
      email_verified_at: verifiedAt,
      email_enabled: true,
      updated_at: verifiedAt,
    })
    .eq("merchant_id", auth.merchant.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ verified_at: verifiedAt });
}
