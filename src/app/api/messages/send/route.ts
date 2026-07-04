import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider, isWindowExpiredError } from "@/lib/messaging";
import { InstagramProvider } from "@/lib/messaging/instagram";
import { getMerchantCredentials } from "@/lib/messaging/credentials";
import { sendMessageSchema } from "@/lib/validations/messaging";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const merchant = auth.merchant;

  const supabase = await createClient();

  const body = await request.json();
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

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

  const credentials = await getMerchantCredentials(
    supabase,
    merchant.id,
    conversation.platform
  );

  if (!credentials) {
    return NextResponse.json(
      { error: `${conversation.platform} not connected` },
      { status: 400 }
    );
  }

  const provider = getProvider(conversation.platform, credentials);

  // Send normally first (works within the 24h standard window). The
  // HUMAN_AGENT tag extends merchant (human) replies to a 7-day window, but
  // it's a separately Meta-reviewed feature — only attempt it as a fallback
  // once we know the standard window has actually expired. AI sends never
  // use this tag.
  let result = await provider.sendMessage(
    conversation.platform_chat_id,
    parsed.data.content
  );

  if (
    !result.success &&
    isWindowExpiredError(result.error) &&
    provider instanceof InstagramProvider
  ) {
    result = await provider.sendMessage(
      conversation.platform_chat_id,
      parsed.data.content,
      { humanAgentTag: true }
    );
  }

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to send message" },
      { status: 500 }
    );
  }

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
