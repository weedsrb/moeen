import type {
  MessagingProvider,
  MessageResult,
  ParsedMessage,
} from "./interface";
import type {
  TelegramUpdate,
  TelegramMessage,
  TelegramBotInfo,
  TelegramApiResponse,
} from "@/types/telegram";
import { createAdminClient } from "@/lib/supabase/admin";

const TELEGRAM_API = "https://api.telegram.org/bot";

export class TelegramProvider implements MessagingProvider {
  private botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  private async callApi<T>(
    method: string,
    body?: Record<string, unknown>
  ): Promise<TelegramApiResponse<T>> {
    const res = await fetch(`${TELEGRAM_API}${this.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json() as Promise<TelegramApiResponse<T>>;
  }

  async sendMessage(chatId: string, text: string): Promise<MessageResult> {
    const res = await this.callApi<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    });

    if (!res.ok) {
      return { success: false, error: res.description ?? "Failed to send message" };
    }

    return {
      success: true,
      messageId: String(res.result?.message_id),
    };
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
    const update = payload as TelegramUpdate;
    const msg: TelegramMessage | undefined =
      update.message ?? update.edited_message;

    if (!msg) {
      throw new Error("No message in Telegram update");
    }

    if (!msg.from) {
      throw new Error("No sender in Telegram message");
    }

    let messageType: ParsedMessage["messageType"] = "text";
    let mediaUrl: string | undefined;
    let text = msg.text ?? "";

    if (msg.photo && msg.photo.length > 0) {
      messageType = "image";
      // Use the largest photo (last in array)
      const largestPhoto = msg.photo[msg.photo.length - 1];
      mediaUrl = largestPhoto.file_id;
      text = msg.caption ?? "";
    } else if (msg.voice) {
      messageType = "voice";
      mediaUrl = msg.voice.file_id;
      text = msg.caption ?? "";
    } else if (msg.document) {
      messageType = "document";
      mediaUrl = msg.document.file_id;
      text = msg.caption ?? "";
    }

    const senderName = [msg.from.first_name, msg.from.last_name]
      .filter(Boolean)
      .join(" ") || null;

    return {
      platformMessageId: String(msg.message_id),
      chatId: String(msg.chat.id),
      senderId: String(msg.from.id),
      senderName,
      text,
      messageType,
      mediaUrl,
      timestamp: new Date(msg.date * 1000),
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
      .eq("platform", "telegram")
      .single();

    if (!conversation) return [];

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!messages) return [];

    return messages.map((m) => ({
      platformMessageId: m.platform_message_id ?? m.id,
      chatId,
      senderId: "",
      senderName: null,
      text: m.content,
      messageType: m.message_type as ParsedMessage["messageType"],
      mediaUrl: m.media_url ?? undefined,
      timestamp: new Date(m.created_at),
    }));
  }

  // --- Static helpers ---

  static async verifyToken(
    botToken: string
  ): Promise<TelegramBotInfo> {
    const res = await fetch(`${TELEGRAM_API}${botToken}/getMe`);
    const data = (await res.json()) as TelegramApiResponse<TelegramBotInfo>;

    if (!data.ok || !data.result) {
      throw new Error(data.description ?? "Invalid bot token");
    }

    return data.result;
  }

  static async setWebhook(
    botToken: string,
    webhookUrl: string,
    secretToken: string
  ): Promise<void> {
    const res = await fetch(`${TELEGRAM_API}${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ["message", "edited_message"],
      }),
    });
    const data = (await res.json()) as TelegramApiResponse<boolean>;

    if (!data.ok) {
      throw new Error(data.description ?? "Failed to set webhook");
    }
  }

  static async deleteWebhook(botToken: string): Promise<void> {
    const res = await fetch(`${TELEGRAM_API}${botToken}/deleteWebhook`, {
      method: "POST",
    });
    const data = (await res.json()) as TelegramApiResponse<boolean>;

    if (!data.ok) {
      throw new Error(data.description ?? "Failed to delete webhook");
    }
  }
}
