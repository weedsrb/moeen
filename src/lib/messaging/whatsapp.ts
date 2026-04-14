import type {
  MessagingProvider,
  MessageResult,
  ParsedMessage,
} from "./interface";
import type {
  WhatsAppWebhookPayload,
  WhatsAppMessage,
  WhatsAppContact,
  WhatsAppSendResponse,
  WhatsAppErrorResponse,
} from "@/types/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export class WhatsAppProvider implements MessagingProvider {
  private phoneNumberId: string;
  private accessToken: string;

  constructor(phoneNumberId: string, accessToken: string) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
  }

  async sendMessage(chatId: string, text: string): Promise<MessageResult> {
    const res = await fetch(
      `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: chatId,
          type: "text",
          text: { body: text },
        }),
      }
    );

    if (!res.ok) {
      const err = (await res.json()) as WhatsAppErrorResponse;
      return { success: false, error: err.error?.message ?? "Failed to send" };
    }

    const data = (await res.json()) as WhatsAppSendResponse;
    return { success: true, messageId: data.messages?.[0]?.id };
  }

  async sendTemplateMessage(
    chatId: string,
    template: string,
    params: Record<string, string>
  ): Promise<MessageResult> {
    let text = template;
    for (const [key, value] of Object.entries(params)) {
      text = text.replaceAll(`{{${key}}}`, value);
    }
    return this.sendMessage(chatId, text);
  }

  receiveWebhook(payload: unknown): ParsedMessage {
    const data = payload as WhatsAppWebhookPayload;
    const entry = data.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) {
      throw new Error("No message in WhatsApp webhook payload");
    }

    const msg: WhatsAppMessage = value.messages[0];
    const contact: WhatsAppContact | undefined = value.contacts?.[0];

    let messageType: ParsedMessage["messageType"] = "text";
    let text = "";
    let mediaUrl: string | undefined;

    switch (msg.type) {
      case "text":
        text = msg.text?.body ?? "";
        break;
      case "image":
        messageType = "image";
        mediaUrl = msg.image?.id;
        text = msg.image?.caption ?? "";
        break;
      case "audio":
        messageType = "voice";
        mediaUrl = msg.audio?.id;
        break;
      case "document":
        messageType = "document";
        mediaUrl = msg.document?.id;
        text = msg.document?.caption ?? "";
        break;
      default:
        text = `[${msg.type}]`;
    }

    return {
      platformMessageId: msg.id,
      chatId: msg.from,
      senderId: msg.from,
      senderName: contact?.profile?.name ?? null,
      text,
      messageType,
      mediaUrl,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
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
      .eq("platform", "whatsapp")
      .single();

    if (!conversation) return [];

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
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

  static async verifyCredentials(
    phoneNumberId: string,
    accessToken: string
  ): Promise<{ displayPhoneNumber: string }> {
    const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = (await res.json()) as WhatsAppErrorResponse;
      throw new Error(err.error?.message ?? "Invalid WhatsApp credentials");
    }

    const data = (await res.json()) as {
      display_phone_number?: string;
      verified_name?: string;
    };
    return {
      displayPhoneNumber:
        data.display_phone_number ?? data.verified_name ?? phoneNumberId,
    };
  }
}
