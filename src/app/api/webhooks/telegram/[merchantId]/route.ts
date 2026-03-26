import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TelegramProvider } from "@/lib/messaging/telegram";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  // Always return 200 to Telegram to prevent retry storms
  try {
    const { merchantId } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    // Look up merchant settings
    const { data: settings } = await supabase
      .from("merchant_settings")
      .select("telegram_bot_token, telegram_webhook_secret, telegram_connected")
      .eq("merchant_id", merchantId)
      .single();

    if (!settings?.telegram_connected || !settings.telegram_bot_token) {
      return NextResponse.json({ ok: true });
    }

    // Verify webhook secret
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    if (settings.telegram_webhook_secret && secretHeader !== settings.telegram_webhook_secret) {
      return NextResponse.json({ ok: true });
    }

    // Parse the Telegram update
    const provider = new TelegramProvider(settings.telegram_bot_token);
    let parsed;
    try {
      parsed = provider.receiveWebhook(body);
    } catch {
      // Not a processable message (e.g. service message, no text)
      return NextResponse.json({ ok: true });
    }

    // Skip empty messages
    if (!parsed.text && !parsed.mediaUrl) {
      return NextResponse.json({ ok: true });
    }

    // Idempotency check
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("platform_message_id", parsed.platformMessageId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true });
    }

    // Find or create customer
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("platform", "telegram")
      .eq("platform_user_id", parsed.senderId)
      .single();

    let customerId: string;

    if (existingCustomer) {
      customerId = existingCustomer.id;
      // Update name if it changed
      if (parsed.senderName) {
        await supabase
          .from("customers")
          .update({ name: parsed.senderName })
          .eq("id", customerId);
      }
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          merchant_id: merchantId,
          platform: "telegram",
          platform_user_id: parsed.senderId,
          name: parsed.senderName,
        })
        .select("id")
        .single();

      if (customerError || !newCustomer) {
        console.error("Failed to create customer:", customerError);
        return NextResponse.json({ ok: true });
      }
      customerId = newCustomer.id;
    }

    // Find or create conversation
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("customer_id", customerId)
      .eq("platform", "telegram")
      .eq("platform_chat_id", parsed.chatId)
      .single();

    let conversationId: string;

    if (existingConversation) {
      conversationId = existingConversation.id;
    } else {
      const { data: newConversation, error: convError } = await supabase
        .from("conversations")
        .insert({
          merchant_id: merchantId,
          customer_id: customerId,
          platform: "telegram",
          platform_chat_id: parsed.chatId,
        })
        .select("id")
        .single();

      if (convError || !newConversation) {
        console.error("Failed to create conversation:", convError);
        return NextResponse.json({ ok: true });
      }
      conversationId = newConversation.id;
    }

    // Save the message
    const { error: msgError } = await supabase.from("messages").insert({
      merchant_id: merchantId,
      conversation_id: conversationId,
      platform_message_id: parsed.platformMessageId,
      direction: "inbound",
      sender_type: "customer",
      content: parsed.text,
      message_type: parsed.messageType,
      media_url: parsed.mediaUrl ?? null,
      has_order_signal: false,
      ai_processed: false,
    });

    if (msgError) {
      console.error("Failed to save message:", msgError);
      return NextResponse.json({ ok: true });
    }

    // Update conversation metadata
    const preview = parsed.text
      ? parsed.text.substring(0, 100)
      : `[${parsed.messageType}]`;

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
        unread_count: (existingConversation ? 1 : 1), // Will use RPC increment below
      })
      .eq("id", conversationId);

    // Increment unread_count if conversation already existed
    if (existingConversation) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("unread_count")
        .eq("id", conversationId)
        .single();

      if (conv) {
        await supabase
          .from("conversations")
          .update({ unread_count: (conv.unread_count ?? 0) + 1 })
          .eq("id", conversationId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}
