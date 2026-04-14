import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WhatsAppProvider } from "@/lib/messaging/whatsapp";
import { processInboundMessage } from "@/lib/ai/process";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await params;
  const searchParams = request.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("merchant_settings")
    .select("whatsapp_verify_token")
    .eq("merchant_id", merchantId)
    .single();

  if (
    !settings?.whatsapp_verify_token ||
    settings.whatsapp_verify_token !== token
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await params;

  try {
    const body = await request.json();

    // Ignore non-message webhooks (status updates, etc.)
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) {
      return NextResponse.json({ success: true });
    }

    const supabase = createAdminClient();

    // Verify merchant has WhatsApp connected
    const { data: settings } = await supabase
      .from("merchant_settings")
      .select("whatsapp_connected, whatsapp_phone_number_id, whatsapp_access_token, ai_auto_acknowledge, ai_acknowledge_template")
      .eq("merchant_id", merchantId)
      .single();

    if (!settings?.whatsapp_connected) {
      return NextResponse.json({ success: true });
    }

    // Parse webhook payload
    const provider = new WhatsAppProvider(
      settings.whatsapp_phone_number_id!,
      settings.whatsapp_access_token!
    );
    const parsed = provider.receiveWebhook(body);

    // Idempotency check
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("platform_message_id", parsed.platformMessageId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true });
    }

    // Find or create customer
    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .upsert(
        {
          merchant_id: merchantId,
          platform: "whatsapp",
          platform_user_id: parsed.senderId,
          name: parsed.senderName ?? `+${parsed.senderId}`,
        },
        { onConflict: "merchant_id,platform,platform_user_id" }
      )
      .select("id")
      .single();

    if (!customer) {
      console.error("[WhatsApp Webhook] Customer upsert failed:", customerErr);
      return NextResponse.json({ success: true });
    }

    // Find or create conversation
    const { data: existingConvo } = await supabase
      .from("conversations")
      .select("id, unread_count")
      .eq("merchant_id", merchantId)
      .eq("platform", "whatsapp")
      .eq("platform_chat_id", parsed.chatId)
      .maybeSingle();

    let conversationId: string;

    if (existingConvo) {
      conversationId = existingConvo.id;
    } else {
      const { data: newConvo, error: convoErr } = await supabase
        .from("conversations")
        .insert({
          merchant_id: merchantId,
          customer_id: customer.id,
          platform: "whatsapp",
          platform_chat_id: parsed.chatId,
          last_message_at: parsed.timestamp.toISOString(),
          last_message_preview: (parsed.text || `[${parsed.messageType}]`).substring(0, 100),
          unread_count: 1,
        })
        .select("id")
        .single();

      if (!newConvo) {
        console.error("[WhatsApp Webhook] Conversation insert failed:", convoErr);
        return NextResponse.json({ success: true });
      }
      conversationId = newConvo.id;
    }

    // Save message
    const { data: savedMessage } = await supabase
      .from("messages")
      .insert({
        merchant_id: merchantId,
        conversation_id: conversationId,
        platform_message_id: parsed.platformMessageId,
        direction: "inbound",
        sender_type: "customer",
        content: parsed.text || `[${parsed.messageType}]`,
        message_type: parsed.messageType,
        media_url: parsed.mediaUrl ?? null,
        has_order_signal: false,
        ai_processed: false,
      })
      .select("id")
      .single();

    // Update conversation metadata for existing conversations
    if (existingConvo) {
      const preview = (parsed.text || `[${parsed.messageType}]`).substring(0, 100);
      await supabase
        .from("conversations")
        .update({
          last_message_at: parsed.timestamp.toISOString(),
          last_message_preview: preview,
          unread_count: (existingConvo.unread_count ?? 0) + 1,
        })
        .eq("id", conversationId);
    }

    // Auto-acknowledge: send instant reply before AI processes (fire-and-forget)
    if (
      settings.ai_auto_acknowledge &&
      settings.ai_acknowledge_template &&
      settings.whatsapp_phone_number_id &&
      settings.whatsapp_access_token
    ) {
      const ackProvider = new WhatsAppProvider(
        settings.whatsapp_phone_number_id,
        settings.whatsapp_access_token
      );
      ackProvider.sendMessage(parsed.chatId, settings.ai_acknowledge_template).catch(() => {});
    }

    // Trigger AI pipeline in background (only for text messages with content)
    if (savedMessage && parsed.text && parsed.messageType === "text") {
      after(() =>
        processInboundMessage({
          messageId: savedMessage.id,
          merchantId,
          conversationId,
          customerId: customer.id,
          content: parsed.text,
          chatId: parsed.chatId,
          whatsappPhoneNumberId: settings.whatsapp_phone_number_id!,
          whatsappAccessToken: settings.whatsapp_access_token!,
        })
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // Always return 200 to prevent Meta retry storms
    console.error("[WhatsApp Webhook] Error:", err);
    return NextResponse.json({ success: true });
  }
}
