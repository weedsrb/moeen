import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppProvider } from "@/lib/messaging/whatsapp";
import { sendMessageSchema } from "@/lib/validations/messaging";

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
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Fetch conversation and verify ownership
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, platform_chat_id, platform")
    .eq("id", parsed.data.conversationId)
    .eq("merchant_id", merchant.id)
    .single();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  if (conversation.platform !== "whatsapp") {
    return NextResponse.json(
      { error: "Only WhatsApp conversations are supported" },
      { status: 400 }
    );
  }

  // Get WhatsApp credentials
  const { data: settings } = await supabase
    .from("merchant_settings")
    .select(
      "whatsapp_phone_number_id, whatsapp_access_token, whatsapp_connected"
    )
    .eq("merchant_id", merchant.id)
    .single();

  if (
    !settings?.whatsapp_connected ||
    !settings.whatsapp_phone_number_id ||
    !settings.whatsapp_access_token
  ) {
    return NextResponse.json(
      { error: "WhatsApp not connected" },
      { status: 400 }
    );
  }

  // Send via WhatsApp
  const provider = new WhatsAppProvider(
    settings.whatsapp_phone_number_id,
    settings.whatsapp_access_token
  );
  const result = await provider.sendMessage(
    conversation.platform_chat_id,
    parsed.data.content
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to send message" },
      { status: 500 }
    );
  }

  // Save outbound message to DB
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .insert({
      merchant_id: merchant.id,
      conversation_id: conversation.id,
      platform_message_id: result.messageId ?? null,
      direction: "outbound",
      sender_type: "merchant",
      content: parsed.data.content,
      message_type: "text",
      has_order_signal: false,
      ai_processed: false,
    })
    .select()
    .single();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Update conversation metadata
  const preview = parsed.data.content.substring(0, 100);
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
    })
    .eq("id", conversation.id);

  return NextResponse.json({ success: true, message });
}
