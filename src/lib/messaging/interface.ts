export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ParsedMessage {
  platformMessageId: string;
  chatId: string;
  senderId: string;
  senderName: string | null;
  text: string;
  messageType: "text" | "image" | "voice" | "document";
  mediaUrl?: string;
  /** Platform message id (mid) this message is a reply to, if any. */
  replyToPlatformMessageId?: string;
  timestamp: Date;
}

export interface SendMessageOptions {
  /**
   * Merchant (human) sends may extend the window to 7 days via the HUMAN_AGENT
   * tag. AI sends must NOT.
   */
  humanAgentTag?: boolean;
  /** Send an image attachment (public HTTPS URL) instead of text. */
  imageUrl?: string;
  /** Reply to a specific earlier message (its platform mid). */
  replyToMid?: string;
}

export interface MessagingProvider {
  sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<MessageResult>;
  sendTemplateMessage(
    chatId: string,
    template: string,
    params: Record<string, string>
  ): Promise<MessageResult>;
  receiveWebhook(payload: unknown): ParsedMessage;
  getConversationHistory(
    chatId: string,
    limit: number
  ): Promise<ParsedMessage[]>;
}
