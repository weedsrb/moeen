import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InstagramProvider } from "@/lib/messaging/instagram";
import { processInboundMessage } from "@/lib/ai/process";
import type { InstagramWebhookPayload } from "@/types/instagram";

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
          "merchant_id, instagram_connected, instagram_user_id, instagram_access_token, ai_auto_acknowledge, ai_acknowledge_template"
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

        // Auto-acknowledge: instant reply before AI processes (fire-and-forget)
        if (settings.ai_auto_acknowledge && settings.ai_acknowledge_template) {
          provider
            .sendMessage(parsed.chatId, settings.ai_acknowledge_template)
            .catch(() => {});
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
