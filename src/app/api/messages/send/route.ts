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
  const chatId = conversation.platform_chat_id;

  // Resolve the replied-to message's platform mid so the provider can thread it.
  let replyToMid: string | undefined;
  if (parsed.data.replyToMessageId) {
    const { data: parent } = await supabase
      .from("messages")
      .select("platform_message_id")
      .eq("id", parsed.data.replyToMessageId)
      .eq("conversation_id", conversation.id)
      .maybeSingle();
    replyToMid = parent?.platform_message_id ?? undefined;
  }

  // Send normally first (works within the 24h standard window). The HUMAN_AGENT
  // tag extends merchant (human) replies to a 7-day window, but it's a
  // separately Meta-reviewed feature — only attempt it as a fallback once we
  // know the standard window has actually expired.
  async function sendWithWindowRetry(
    text: string,
    opts: { imageUrl?: string; replyToMid?: string }
  ) {
    let result = await provider.sendMessage(chatId, text, opts);
    if (
      !result.success &&
      isWindowExpiredError(result.error) &&
      provider instanceof InstagramProvider
    ) {
      result = await provider.sendMessage(chatId, text, {
        ...opts,
        humanAgentTag: true,
      });
    }
    return result;
  }

  const content = parsed.data.content?.trim();
  const mediaUrl = parsed.data.mediaUrl;
  const replyToMessageId = parsed.data.replyToMessageId ?? null;

  type InsertedMessage = { id: string } & Record<string, unknown>;
  const inserted: InsertedMessage[] = [];

  // Instagram can't combine text + attachment in one send. If both are present,
  // send the image first (it carries the reply-thread), then the caption text.
  if (mediaUrl) {
    const result = await sendWithWindowRetry("", { imageUrl: mediaUrl, replyToMid });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Failed to send image" },
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
        content: "",
        message_type: "image",
        media_url: mediaUrl,
        reply_to_message_id: replyToMessageId,
        has_order_signal: false,
        ai_processed: false,
      })
      .select()
      .single();

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }
    inserted.push(message as InsertedMessage);
  }

  if (content) {
    // When an image already carried the reply thread, the caption follows up
    // unthreaded.
    const result = await sendWithWindowRetry(content, {
      replyToMid: mediaUrl ? undefined : replyToMid,
    });
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
        content,
        message_type: "text",
        reply_to_message_id: mediaUrl ? null : replyToMessageId,
        has_order_signal: false,
        ai_processed: false,
      })
      .select()
      .single();

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }
    inserted.push(message as InsertedMessage);
  }

  const preview = (content || "[image]").substring(0, 100);
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      automation_mode: "human_takeover",
      takeover_reason: "merchant_replied",
      taken_over_at: new Date().toISOString(),
      resumed_at: null,
    })
    .eq("id", conversation.id);

  return NextResponse.json({
    success: true,
    message: inserted[inserted.length - 1] ?? null,
    messages: inserted,
  });
}
