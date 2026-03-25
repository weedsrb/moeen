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
  timestamp: Date;
}

export interface MessagingProvider {
  sendMessage(chatId: string, text: string): Promise<MessageResult>;
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
