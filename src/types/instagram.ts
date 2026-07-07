/** Instagram API with Instagram Login types (Meta Graph API, graph.instagram.com) */

// --- Inbound webhook payload ---
// Instagram uses the Messenger-style `entry[].messaging[]` shape, which is
// different from WhatsApp's `entry[].changes[].value.messages[]`.

export interface InstagramWebhookPayload {
  object: "instagram";
  entry: InstagramEntry[];
}

export interface InstagramEntry {
  id: string; // IG business account ID (the recipient) — used to resolve the merchant
  time: number;
  messaging: InstagramMessaging[];
}

export interface InstagramMessaging {
  sender: { id: string }; // IGSID of the customer
  recipient: { id: string }; // IG business account ID
  timestamp: number;
  message?: InstagramInboundMessage;
}

export interface InstagramInboundMessage {
  mid: string;
  text?: string;
  is_echo?: boolean; // messages the business account itself sent
  attachments?: InstagramAttachment[];
  /** Present when the customer replied to a specific earlier message. */
  reply_to?: { mid: string };
}

export interface InstagramAttachment {
  type: "image" | "audio" | "video" | "file" | "share" | "story_mention";
  payload: { url?: string };
}

// --- Outbound send ---

export interface InstagramSendResponse {
  recipient_id: string;
  message_id: string;
}

export interface InstagramErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
  };
}

// --- OAuth / token exchange ---

export interface InstagramShortLivedTokenResponse {
  access_token: string;
  user_id: string;
  permissions?: string[];
}

export interface InstagramLongLivedTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number; // seconds (~60 days)
}

export interface InstagramProfile {
  user_id: string;
  username: string;
  name?: string;
  /** CDN-hosted profile picture URL; may be absent or expire over time. */
  profile_pic?: string;
}

// --- Conversation history (backfill) ---
// Read via the Conversations API (graph.instagram.com/{version}/me/conversations).
// Note: Meta only returns details for the ~20 most recent messages per
// conversation — older ones error out as "deleted" and cannot be imported.

export interface InstagramConversationParticipant {
  id: string; // IGSID (the business account's own id, or a customer's)
  username?: string;
  name?: string;
  profile_pic?: string;
}

export interface InstagramConversationSummary {
  id: string; // conversation (thread) id
  updatedTime: string | null;
  participants: InstagramConversationParticipant[];
}

/** A single message as returned when expanding `messages{...}` on a conversation. */
export interface InstagramHistoryMessage {
  id: string; // platform message id (mid)
  created_time: string;
  from?: { id: string; username?: string };
  to?: { data?: { id: string; username?: string }[] };
  message?: string;
  /** Shared post/media — only its image/video url is included, if any. */
  shares?: { data?: { link?: string }[] };
  /** Story reply/mention — carries a media link when present. */
  story?: { link?: string; mention?: { link?: string } };
}
