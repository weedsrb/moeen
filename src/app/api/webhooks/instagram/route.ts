import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InstagramProvider } from "@/lib/messaging/instagram";
import {
  rehostInstagramImage,
  rehostInstagramAudio,
} from "@/lib/messaging/rehost-media";
import { processInboundMessage } from "@/lib/ai/process";
import type { InstagramWebhookPayload } from "@/types/instagram";

// The AI pipeline now debounces bursts (sleeps ~8s) before calling Gemini
// (with a retry) inside after(). Give the function headroom on Vercel.
export const maxDuration = 60;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendDelayedAcknowledgement(params: {
  merchantId: string;
  conversationId: string;
  inboundMessageId: string;
  inboundCreatedAt: string;
  chatId: string;
  instagramUserId: string;
  accessToken: string;
  template: string;
  delaySeconds: number;
}): Promise<void> {
  await delay(params.delaySeconds * 1_000);
  const supabase = createAdminClient();

  const [controlResult, responseResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("automation_mode")
      .eq("id", params.conversationId)
      .eq("merchant_id", params.merchantId)
      .single(),
    supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", params.conversationId)
      .eq("direction", "outbound")
      .gt("created_at", params.inboundCreatedAt)
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    controlResult.error ||
    controlResult.data?.automation_mode !== "ai" ||
    responseResult.error ||
    responseResult.data
  ) {
    return;
  }

  const provider = new InstagramProvider(
    params.instagramUserId,
    params.accessToken
  );
  const result = await provider.sendMessage(params.chatId, params.template);
  if (!result.success) return;

  await supabase.from("messages").insert({
    merchant_id: params.merchantId,
    conversation_id: params.conversationId,
    platform_message_id: result.messageId ?? null,
    direction: "outbound",
    sender_type: "system",
    content: params.template,
    message_type: "text",
    has_order_signal: false,
    ai_processed: false,
  });
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: params.template.substring(0, 100),
    })
    .eq("id", params.conversationId)
    .eq("merchant_id", params.merchantId);

  console.log(
    `[Instagram Webhook] delayed acknowledgement sent for ${params.inboundMessageId.slice(0, 8)}`
  );
}

/**
 * Single app-level Instagram webhook endpoint (no [merchantId] in the path —
 * one Mo'een app serves all merchants). Events arrive keyed by the IG business
 * account ID (entry.id), which we resolve to a merchant via
 * merchant_settings.instagram_user_id.
 */

// GET — Meta verification challenge. Uses one app-level verify token from env.
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad request", { status: 400 });
  }

  if (!expected || token !== expected) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// POST — inbound messaging events. Always returns 200 (prevent Meta retries).
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as InstagramWebhookPayload;

    if (body.object !== "instagram" || !body.entry?.length) {
      return NextResponse.json({ success: true });
    }

    const supabase = createAdminClient();

    for (const entry of body.entry) {
      const igAccountId = entry.id;
      const events = entry.messaging ?? [];
      if (!events.length) continue;

      // Resolve merchant by IG account ID (replaces merchantId-in-path).
      const { data: settings } = await supabase
        .from("merchant_settings")
        .select(
          "merchant_id, instagram_connected, instagram_user_id, instagram_access_token, ai_acknowledge_template, ai_acknowledgement_mode, ai_ack_delay_seconds"
        )
        .eq("instagram_user_id", igAccountId)
        .maybeSingle();

      if (
        !settings?.instagram_connected ||
        !settings.instagram_user_id ||
        !settings.instagram_access_token
      ) {
        continue;
      }

      const merchantId = settings.merchant_id;
      const provider = new InstagramProvider(
        settings.instagram_user_id,
        settings.instagram_access_token
      );

      for (const event of events) {
        // Only handle inbound customer messages (skip echoes, read receipts, etc.)
        if (!event.message || event.message.is_echo) continue;

        const parsed = provider.receiveWebhook({
          object: "instagram",
          entry: [{ ...entry, messaging: [event] }],
        });

        // Idempotency check
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("platform_message_id", parsed.platformMessageId)
          .maybeSingle();

        if (existing) continue;

        // Resolve the customer's IG username/name (fallback to @{igsid})
        const profile = await InstagramProvider.resolveProfile(
          parsed.senderId,
          settings.instagram_access_token
        );
        const customerName = profile?.name ?? profile?.username ?? `@${parsed.senderId}`;

        // Find or create customer. Only overwrite avatar_url when we actually
        // resolved one, so a transient profile fetch failure doesn't wipe it.
        const customerRow: {
          merchant_id: string;
          platform: string;
          platform_user_id: string;
          name: string;
          avatar_url?: string;
        } = {
          merchant_id: merchantId,
          platform: "instagram",
          platform_user_id: parsed.senderId,
          name: customerName,
        };
        if (profile?.profile_pic) {
          customerRow.avatar_url = profile.profile_pic;
        }

        const { data: customer, error: customerErr } = await supabase
          .from("customers")
          .upsert(customerRow, {
            onConflict: "merchant_id,platform,platform_user_id",
          })
          .select("id")
          .single();

        if (!customer) {
          console.error("[Instagram Webhook] Customer upsert failed:", customerErr);
          continue;
        }

        // Find or create conversation
        const { data: existingConvo } = await supabase
          .from("conversations")
          .select("id, unread_count")
          .eq("merchant_id", merchantId)
          .eq("platform", "instagram")
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
              platform: "instagram",
              platform_chat_id: parsed.chatId,
              last_message_at: parsed.timestamp.toISOString(),
              last_message_preview: (parsed.text || `[${parsed.messageType}]`).substring(0, 100),
              unread_count: 1,
            })
            .select("id")
            .single();

          if (!newConvo) {
            console.error("[Instagram Webhook] Conversation insert failed:", convoErr);
            continue;
          }
          conversationId = newConvo.id;
        }

        // Re-host inbound media: Instagram's attachment URLs are time-limited
        // CDN links that expire, so persist the bytes in our own storage. Done
        // inline (not in after()) so the single INSERT — and the realtime event
        // the client receives — already carries the durable URL. Images and
        // voice notes are re-hosted; other media keep their raw URL (chips).
        let mediaUrl = parsed.mediaUrl ?? null;
        if (mediaUrl && parsed.messageType === "image") {
          mediaUrl = await rehostInstagramImage(mediaUrl, merchantId);
        } else if (mediaUrl && parsed.messageType === "voice") {
          mediaUrl = await rehostInstagramAudio(mediaUrl, merchantId);
        }

        // Resolve reply context: map the replied-to platform mid back to our
        // stored message so the UI can render a quoted block.
        let replyToMessageId: string | null = null;
        if (parsed.replyToPlatformMessageId) {
          const { data: parent } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("platform_message_id", parsed.replyToPlatformMessageId)
            .maybeSingle();
          replyToMessageId = parent?.id ?? null;
        }

        // Save inbound message
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
            media_url: mediaUrl,
            reply_to_message_id: replyToMessageId,
            has_order_signal: false,
            ai_processed: false,
          })
          .select("id, created_at")
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

        // Delayed fallback: send and persist only if no AI/merchant response
        // arrived first and the conversation is still AI-owned.
        if (
          savedMessage &&
          settings.ai_acknowledgement_mode === "delayed" &&
          settings.ai_acknowledge_template
        ) {
          after(() =>
            sendDelayedAcknowledgement({
              merchantId,
              conversationId,
              inboundMessageId: savedMessage.id,
              inboundCreatedAt: savedMessage.created_at,
              chatId: parsed.chatId,
              instagramUserId: settings.instagram_user_id!,
              accessToken: settings.instagram_access_token!,
              template: settings.ai_acknowledge_template!,
              delaySeconds: settings.ai_ack_delay_seconds ?? 12,
            })
          );
        }

        // Trigger AI pipeline in background (text messages with content only)
        if (savedMessage && parsed.text && parsed.messageType === "text") {
          after(() =>
            processInboundMessage({
              messageId: savedMessage.id,
              merchantId,
              conversationId,
              customerId: customer.id,
              content: parsed.text,
              chatId: parsed.chatId,
              platform: "instagram",
              credentials: {
                igUserId: settings.instagram_user_id!,
                accessToken: settings.instagram_access_token!,
              },
              messageCreatedAt: savedMessage.created_at,
            })
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // Always return 200 to prevent Meta retry storms
    console.error("[Instagram Webhook] Error:", err);
    return NextResponse.json({ success: true });
  }
}
