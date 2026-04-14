import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppProvider } from "@/lib/messaging/whatsapp";
import { connectWhatsAppSchema } from "@/lib/validations/whatsapp";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!merchant) {
    return NextResponse.json(
      { error: "Merchant not found" },
      { status: 404 }
    );
  }

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!merchant) {
    return NextResponse.json(
      { error: "Merchant not found" },
      { status: 404 }
    );
  }

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
