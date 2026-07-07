import type {
  MessagingProvider,
  MessageResult,
  ParsedMessage,
  SendMessageOptions,
} from "./interface";
import type {
  InstagramWebhookPayload,
  InstagramMessaging,
  InstagramInboundMessage,
  InstagramSendResponse,
  InstagramErrorResponse,
  InstagramShortLivedTokenResponse,
  InstagramLongLivedTokenResponse,
  InstagramProfile,
  InstagramConversationSummary,
  InstagramConversationParticipant,
  InstagramHistoryMessage,
} from "@/types/instagram";
import { createAdminClient } from "@/lib/supabase/admin";
import { MESSAGE_COLUMNS } from "@/lib/db/columns";

// Verify against live Meta docs at build time — Meta bumps the Graph API
// version and renames scopes frequently.
const GRAPH_API_VERSION = "v25.0";
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const LONG_LIVED_TOKEN_URL = `https://graph.instagram.com/access_token`;
const REFRESH_TOKEN_URL = `https://graph.instagram.com/refresh_access_token`;

/**
 * Returns true when a send failed because the 24-hour standard messaging
 * window has expired — the caller should raise a `customer_waiting` flag
 * instead of treating it as a hard failure.
 */
export function isWindowExpiredError(error: string | undefined): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes("outside of allowed window") ||
    e.includes("outside the allowed window") ||
    e.includes("outside of the allowed window") ||
    e.includes("24 hour") ||
    e.includes("24-hour")
  );
}

export class InstagramProvider implements MessagingProvider {
  private igUserId: string;
  private accessToken: string;

  constructor(igUserId: string, accessToken: string) {
    this.igUserId = igUserId;
    this.accessToken = accessToken;
  }

  async sendMessage(
    chatId: string,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<MessageResult> {
    // Instagram cannot combine text + attachment in one send — an image send
    // carries only the attachment; any caption is sent as a separate message
    // by the caller.
    const message: Record<string, unknown> = options.imageUrl
      ? {
          attachment: {
            type: "image",
            payload: { url: options.imageUrl, is_reusable: false },
          },
        }
      : { text };

    const body: Record<string, unknown> = {
      recipient: { id: chatId },
      message,
    };
    if (options.replyToMid) {
      body.reply_to = { mid: options.replyToMid };
    }
    if (options.humanAgentTag) {
      body.messaging_type = "MESSAGE_TAG";
      body.tag = "HUMAN_AGENT";
    }

    const res = await fetch(`${GRAPH_API_BASE}/${this.igUserId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json()) as InstagramErrorResponse;
      return { success: false, error: err.error?.message ?? "Failed to send" };
    }

    const data = (await res.json()) as InstagramSendResponse;
    return { success: true, messageId: data.message_id };
  }

  async sendTemplateMessage(): Promise<MessageResult> {
    // Instagram has no approved-template system — there is no cheap
    // re-engagement outside the 24h window.
    throw new Error("Instagram does not support template messages");
  }

  receiveWebhook(payload: unknown): ParsedMessage {
    const data = payload as InstagramWebhookPayload;
    const entry = data.entry?.[0];
    const event: InstagramMessaging | undefined = entry?.messaging?.[0];

    if (!event?.message) {
      throw new Error("No message in Instagram webhook payload");
    }

    const msg: InstagramInboundMessage = event.message;

    let messageType: ParsedMessage["messageType"] = "text";
    let text = msg.text ?? "";
    let mediaUrl: string | undefined;

    const attachment = msg.attachments?.[0];
    if (attachment) {
      switch (attachment.type) {
        case "image":
        case "story_mention":
        case "share":
          messageType = "image";
          break;
        case "audio":
          messageType = "voice";
          break;
        case "file":
          messageType = "document";
          break;
        default:
          messageType = "text";
      }
      mediaUrl = attachment.payload?.url;
      // Placeholder from the *mapped* type (voice/image/document), not the raw
      // Instagram attachment kind — so the chat UI's `[${message_type}]`
      // placeholder guard matches and doesn't render it as a caption.
      if (!text) text = `[${messageType}]`;
    }

    return {
      platformMessageId: msg.mid,
      chatId: event.sender.id, // IGSID — reply target
      senderId: event.sender.id,
      senderName: null, // resolved separately via resolveProfile
      text,
      messageType,
      mediaUrl,
      replyToPlatformMessageId: msg.reply_to?.mid,
      timestamp: new Date(event.timestamp),
    };
  }

  async getConversationHistory(
    chatId: string,
    limit: number
  ): Promise<ParsedMessage[]> {
    const supabase = createAdminClient();

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("platform_chat_id", chatId)
      .eq("platform", "instagram")
      .single();

    if (!conversation) return [];

    const { data: messages } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!messages) return [];

    return messages.map(
      (m: {
        platform_message_id: string | null;
        id: string;
        content: string;
        message_type: string;
        media_url: string | null;
        created_at: string;
      }) => ({
        platformMessageId: m.platform_message_id ?? m.id,
        chatId,
        senderId: "",
        senderName: null,
        text: m.content,
        messageType: m.message_type as ParsedMessage["messageType"],
        mediaUrl: m.media_url ?? undefined,
        timestamp: new Date(m.created_at),
      })
    );
  }

  /** Fetch a customer's username/name for a given IGSID. */
  static async resolveProfile(
    igsid: string,
    accessToken: string
  ): Promise<InstagramProfile | null> {
    const res = await fetch(
      `${GRAPH_API_BASE}/${igsid}?fields=name,username,profile_pic&access_token=${accessToken}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id?: string;
      name?: string;
      username?: string;
      profile_pic?: string;
    };
    if (!data.username) return null;
    return {
      user_id: data.id ?? igsid,
      username: data.username,
      name: data.name,
      profile_pic: data.profile_pic,
    };
  }

  // --- Conversation history (backfill) ---
  // These read past DMs to seed Mo'een with conversations that predate the
  // connection. Meta caps message detail at the ~20 most recent per thread.

  /**
   * List every conversation on the connected account, newest-activity first.
   * Follows `paging.next` up to `maxConversations` (default 100) so a large
   * inbox doesn't run unbounded.
   */
  static async listConversations(
    accessToken: string,
    maxConversations = 100
  ): Promise<InstagramConversationSummary[]> {
    // Keep participant subfields to the reliably-supported id+username; name and
    // avatar are backfilled per-customer via resolveProfile during import.
    const fields = "id,updated_time,participants{id,username}";
    let url:
      | string
      | null = `${GRAPH_API_BASE}/me/conversations?platform=instagram&fields=${fields}&limit=50&access_token=${accessToken}`;

    const conversations: InstagramConversationSummary[] = [];

    while (url && conversations.length < maxConversations) {
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Instagram conversations fetch failed: ${err}`);
      }
      const data = (await res.json()) as {
        data?: Array<{
          id: string;
          updated_time?: string;
          participants?: { data?: InstagramConversationParticipant[] };
        }>;
        paging?: { next?: string };
      };

      for (const c of data.data ?? []) {
        conversations.push({
          id: c.id,
          updatedTime: c.updated_time ?? null,
          participants: c.participants?.data ?? [],
        });
      }

      url = data.paging?.next ?? null;
    }

    return conversations.slice(0, maxConversations);
  }

  /**
   * Fetch the (up to 20) most recent messages in a conversation, oldest first.
   * Meta returns only the last ~20; anything older reports as deleted, so this
   * is the deepest backfill the API allows.
   */
  static async fetchConversationMessages(
    conversationId: string,
    accessToken: string
  ): Promise<InstagramHistoryMessage[]> {
    const fields =
      "messages.limit(20){id,created_time,from,to,message,shares,story}";
    const res = await fetch(
      `${GRAPH_API_BASE}/${conversationId}?fields=${fields}&access_token=${accessToken}`
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Instagram messages fetch failed: ${err}`);
    }
    const data = (await res.json()) as {
      messages?: { data?: InstagramHistoryMessage[] };
    };
    const messages = data.messages?.data ?? [];
    // The API returns newest-first; import in chronological order.
    return [...messages].sort(
      (a, b) =>
        new Date(a.created_time).getTime() - new Date(b.created_time).getTime()
    );
  }

  /** Fetch the connected account's own IG user id + username using its token. */
  static async getSelf(
    accessToken: string
  ): Promise<{ user_id: string; username: string }> {
    const res = await fetch(
      `${GRAPH_API_BASE}/me?fields=user_id,username&access_token=${accessToken}`
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Instagram profile fetch failed: ${err}`);
    }
    const data = (await res.json()) as {
      user_id?: string;
      id?: string;
      username?: string;
    };
    return {
      user_id: data.user_id ?? data.id ?? "",
      username: data.username ?? "",
    };
  }

  /** Subscribe this IG account to the app's `messages` webhook field. */
  static async subscribeToMessages(
    igUserId: string,
    accessToken: string
  ): Promise<void> {
    const res = await fetch(
      `${GRAPH_API_BASE}/${igUserId}/subscribed_apps?subscribed_fields=messages&access_token=${accessToken}`,
      { method: "POST" }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Instagram webhook subscribe failed: ${err}`);
    }
  }

  // --- OAuth / token lifecycle helpers ---

  /** Exchange an authorization code for a short-lived token + IG user id. */
  static async exchangeCodeForToken(params: {
    appId: string;
    appSecret: string;
    redirectUri: string;
    code: string;
  }): Promise<InstagramShortLivedTokenResponse> {
    const form = new URLSearchParams({
      client_id: params.appId,
      client_secret: params.appSecret,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
      code: params.code,
    });
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Instagram code exchange failed: ${err}`);
    }
    return (await res.json()) as InstagramShortLivedTokenResponse;
  }

  /** Exchange a short-lived token for a long-lived (~60 day) token. */
  static async exchangeForLongLivedToken(params: {
    appSecret: string;
    shortLivedToken: string;
  }): Promise<InstagramLongLivedTokenResponse> {
    const qs = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: params.appSecret,
      access_token: params.shortLivedToken,
    });
    const res = await fetch(`${LONG_LIVED_TOKEN_URL}?${qs.toString()}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Instagram long-lived token exchange failed: ${err}`);
    }
    return (await res.json()) as InstagramLongLivedTokenResponse;
  }

  /** Refresh a long-lived token (must be at least 24h old, not yet expired). */
  static async refreshLongLivedToken(
    accessToken: string
  ): Promise<InstagramLongLivedTokenResponse> {
    const qs = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: accessToken,
    });
    const res = await fetch(`${REFRESH_TOKEN_URL}?${qs.toString()}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Instagram token refresh failed: ${err}`);
    }
    return (await res.json()) as InstagramLongLivedTokenResponse;
  }
}
