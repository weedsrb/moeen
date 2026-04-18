import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundMessage } from "@/lib/ai/process";
import { z } from "zod/v4";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

const reprocessSchema = z.object({
  messageId: z.string().uuid(),
});

/**
 * POST /api/ai/process
 * Manual reprocessing endpoint — re-runs the AI pipeline on a specific message.
 * Requires authentication (user must own the merchant).
 */
export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const merchant = auth.merchant;

  const body = await request.json();
  const parsed = reprocessSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

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

  await admin
    .from("messages")
    .update({ ai_processed: false, ai_result: null, has_order_signal: false })
    .eq("id", message.id);

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
