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
}
