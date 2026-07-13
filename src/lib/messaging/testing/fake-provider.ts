import type {
  MessageResult,
  MessagingProvider,
  ParsedMessage,
  SendMessageOptions,
} from "../interface";

export interface FakeSentMessage {
  chatId: string;
  text: string;
  options?: SendMessageOptions;
}

export class FakeMessagingProvider implements MessagingProvider {
  readonly sent: FakeSentMessage[] = [];
  history: ParsedMessage[] = [];
  nextResult: MessageResult = { success: true, messageId: "fake-mid" };

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<MessageResult> {
    this.sent.push({ chatId, text, options });
    return this.nextResult;
  }

  async sendTemplateMessage(
    chatId: string,
    template: string,
    params: Record<string, string>
  ): Promise<MessageResult> {
    const text = Object.entries(params).reduce(
      (rendered, [key, value]) => rendered.replaceAll(`{${key}}`, value),
      template
    );
    return this.sendMessage(chatId, text);
  }

  receiveWebhook(payload: unknown): ParsedMessage {
    return payload as ParsedMessage;
  }

  async getConversationHistory(
    _chatId: string,
    limit: number
  ): Promise<ParsedMessage[]> {
    return this.history.slice(-limit);
  }
}
