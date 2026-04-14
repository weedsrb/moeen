import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundMessage } from "@/lib/ai/process";
import { z } from "zod/v4";

const reprocessSchema = z.object({
  messageId: z.string().uuid(),
});

/**
 * POST /api/ai/process
 * Manual reprocessing endpoint — re-runs the AI pipeline on a specific message.
 * Requires authentication (user must own the merchant).
 */
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
  const parsed = reprocessSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Fetch the message and verify it belongs to this merchant
  const admin = createAdminClient();
  const { data: message } = await admin
    .from("messages")
    .select("id, conversation_id, content, merchant_id, message_type")
    .eq("id", parsed.data.messageId)
    .eq("merchant_id", merchant.id)
    .single();

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Fetch conversation for chatId and customer
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, platform_chat_id, customer_id")
    .eq("id", message.conversation_id)
    .single();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // Fetch WhatsApp credentials
  const { data: settings } = await admin
    .from("merchant_settings")
    .select("whatsapp_phone_number_id, whatsapp_access_token")
    .eq("merchant_id", merchant.id)
    .single();

  if (!settings?.whatsapp_phone_number_id || !settings?.whatsapp_access_token) {
    return NextResponse.json(
      { error: "WhatsApp not connected" },
      { status: 400 }
    );
  }

  // Reset AI fields before reprocessing
  await admin
    .from("messages")
    .update({ ai_processed: false, ai_result: null, has_order_signal: false })
    .eq("id", message.id);

  // Run pipeline
  await processInboundMessage({
    messageId: message.id,
    merchantId: merchant.id,
    conversationId: conversation.id,
    customerId: conversation.customer_id,
    content: message.content,
    chatId: conversation.platform_chat_id,
    whatsappPhoneNumberId: settings.whatsapp_phone_number_id,
    whatsappAccessToken: settings.whatsapp_access_token,
  });

  return NextResponse.json({ success: true });
}
