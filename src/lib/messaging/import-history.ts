import { createAdminClient } from "@/lib/supabase/admin";
import { InstagramProvider } from "./instagram";
import { rehostInstagramImage } from "./rehost-media";
import type {
  InstagramConversationParticipant,
  InstagramHistoryMessage,
} from "@/types/instagram";

export interface ImportHistoryResult {
  conversations: number;
  messages: number;
}

interface ImportHistoryParams {
  merchantId: string;
  igUserId: string;
  accessToken: string;
  /** Cap on how many conversations to walk (newest-activity first). */
  maxConversations?: number;
}

/**
 * Backfill Instagram DM history into Mo'een so conversations that predate the
 * connection (or the earlier part of an existing thread) show up in Messages.
 *
 * Meta only returns the ~20 most recent messages per conversation, so this is
 * the deepest history the API allows. Each conversation is processed in its own
 * try/catch (fail-open) so one bad thread never aborts the whole run. Imported
 * messages are historical: they never bump unread counts and never trigger the
 * AI pipeline.
 */
export async function importInstagramHistory({
  merchantId,
  igUserId,
  accessToken,
  maxConversations = 100,
}: ImportHistoryParams): Promise<ImportHistoryResult> {
  const supabase = createAdminClient();
  const result: ImportHistoryResult = { conversations: 0, messages: 0 };

  const threads = await InstagramProvider.listConversations(
    accessToken,
    maxConversations
  );

  for (const thread of threads) {
    try {
      // The other participant is the customer (skip our own account).
      const customerParticipant = thread.participants.find(
        (p) => p.id && p.id !== igUserId
      );
      if (!customerParticipant) continue;

      const customerId = await upsertCustomer(
        supabase,
        merchantId,
        customerParticipant,
        accessToken
      );
      if (!customerId) continue;

      const conversationId = await findOrCreateConversation(
        supabase,
        merchantId,
        customerId,
        customerParticipant.id
      );
      if (!conversationId) continue;

      const messages = await InstagramProvider.fetchConversationMessages(
        thread.id,
        accessToken
      );
      if (messages.length === 0) {
        result.conversations += 1;
        continue;
      }

      // Idempotency: only insert messages we don't already have.
      const { data: existingRows } = await supabase
        .from("messages")
        .select("platform_message_id")
        .eq("conversation_id", conversationId);
      const existingIds = new Set(
        (existingRows ?? [])
          .map((r) => r.platform_message_id)
          .filter((id): id is string => !!id)
      );

      const rows: Record<string, unknown>[] = [];
      let newestPreview: { at: string; text: string } | null = null;

      for (const msg of messages) {
        if (existingIds.has(msg.id)) continue;

        const parsed = await parseHistoryMessage(msg, merchantId);
        if (!parsed) continue; // nothing renderable (reaction, unreadable media)

        const isOutbound = !!msg.from?.id && msg.from.id === igUserId;
        rows.push({
          merchant_id: merchantId,
          conversation_id: conversationId,
          platform_message_id: msg.id,
          direction: isOutbound ? "outbound" : "inbound",
          sender_type: isOutbound ? "merchant" : "customer",
          content: parsed.content,
          message_type: parsed.messageType,
          media_url: parsed.mediaUrl,
          reply_to_message_id: null,
          has_order_signal: false,
          ai_processed: true, // historical — never run the pipeline on these
          created_at: msg.created_time,
        });

        const previewText =
          parsed.content || `[${parsed.messageType}]`;
        if (!newestPreview || msg.created_time > newestPreview.at) {
          newestPreview = { at: msg.created_time, text: previewText };
        }
      }

      if (rows.length > 0) {
        const { error: insertErr } = await supabase.from("messages").insert(rows);
        if (!insertErr) {
          result.messages += rows.length;
          await bumpConversationIfNewer(supabase, conversationId, newestPreview);
        }
      }

      result.conversations += 1;
    } catch (err) {
      console.error(
        `[IG History Import] thread ${thread.id} failed:`,
        err
      );
      // fail-open: continue with the next conversation
    }
  }

  return result;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function upsertCustomer(
  supabase: AdminClient,
  merchantId: string,
  participant: InstagramConversationParticipant,
  accessToken: string
): Promise<string | null> {
  // Prefer the participant's own fields; fall back to a profile lookup for the
  // display name / avatar when the conversation payload omits them.
  let name = participant.name ?? participant.username ?? null;
  let avatar = participant.profile_pic ?? null;

  if (!name || !avatar) {
    const profile = await InstagramProvider.resolveProfile(
      participant.id,
      accessToken
    );
    if (profile) {
      name = name ?? profile.name ?? profile.username;
      avatar = avatar ?? profile.profile_pic ?? null;
    }
  }

  const row: {
    merchant_id: string;
    platform: string;
    platform_user_id: string;
    name: string;
    avatar_url?: string;
  } = {
    merchant_id: merchantId,
    platform: "instagram",
    platform_user_id: participant.id,
    name: name ?? `@${participant.id}`,
  };
  if (avatar) row.avatar_url = avatar;

  const { data } = await supabase
    .from("customers")
    .upsert(row, { onConflict: "merchant_id,platform,platform_user_id" })
    .select("id")
    .single();

  return data?.id ?? null;
}

async function findOrCreateConversation(
  supabase: AdminClient,
  merchantId: string,
  customerId: string,
  customerIgsid: string
): Promise<string | null> {
  // Key on the customer IGSID so imported threads merge with live webhook
  // messages (whose chatId is the sender IGSID), never fork.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("platform", "instagram")
    .eq("platform_chat_id", customerIgsid)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("conversations")
    .insert({
      merchant_id: merchantId,
      customer_id: customerId,
      platform: "instagram",
      platform_chat_id: customerIgsid,
      unread_count: 0, // historical — don't inflate the badge
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

interface ParsedHistory {
  content: string;
  messageType: "text" | "image";
  mediaUrl: string | null;
}

async function parseHistoryMessage(
  msg: InstagramHistoryMessage,
  merchantId: string
): Promise<ParsedHistory | null> {
  const text = msg.message?.trim() ?? "";
  if (text) return { content: text, messageType: "text", mediaUrl: null };

  // No text — best-effort media (shared post / story link). History rarely
  // exposes raw voice/file attachments, so anything with a link is treated as
  // an image and re-hosted; unreadable messages are skipped.
  const mediaLink =
    msg.shares?.data?.[0]?.link ??
    msg.story?.link ??
    msg.story?.mention?.link ??
    null;

  if (!mediaLink) return null;

  const rehosted = await rehostInstagramImage(mediaLink, merchantId);
  return { content: "", messageType: "image", mediaUrl: rehosted };
}

async function bumpConversationIfNewer(
  supabase: AdminClient,
  conversationId: string,
  newest: { at: string; text: string } | null
): Promise<void> {
  if (!newest) return;

  const { data: convo } = await supabase
    .from("conversations")
    .select("last_message_at")
    .eq("id", conversationId)
    .single();

  // Only advance the preview/timestamp when the imported message is newer than
  // whatever the conversation already reflects (live messages win).
  if (convo?.last_message_at && convo.last_message_at >= newest.at) return;

  await supabase
    .from("conversations")
    .update({
      last_message_at: newest.at,
      last_message_preview: newest.text.substring(0, 100),
    })
    .eq("id", conversationId);
}
