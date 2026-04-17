import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppProvider } from "@/lib/messaging/whatsapp";
import { connectWhatsAppSchema } from "@/lib/validations/whatsapp";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const merchant = auth.merchant;

  const supabase = await createClient();

  const body = await request.json();
  const parsed = connectWhatsAppSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { phoneNumberId, accessToken, verifyToken, businessAccountId } =
    parsed.data;

  try {
    const { displayPhoneNumber } = await WhatsAppProvider.verifyCredentials(
      phoneNumberId,
      accessToken
    );

    const { error: updateError } = await supabase
      .from("merchant_settings")
      .update({
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_access_token: accessToken,
        whatsapp_verify_token: verifyToken,
        whatsapp_business_account_id: businessAccountId ?? null,
        whatsapp_display_phone: displayPhoneNumber,
        whatsapp_connected: true,
      })
      .eq("merchant_id", merchant.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, displayPhoneNumber });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to verify credentials";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const merchant = auth.merchant;

  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("merchant_settings")
    .update({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      whatsapp_verify_token: null,
      whatsapp_business_account_id: null,
      whatsapp_display_phone: null,
      whatsapp_connected: false,
    })
    .eq("merchant_id", merchant.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
