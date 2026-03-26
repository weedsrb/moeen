import { z } from "zod";

export const connectTelegramSchema = z.object({
  botToken: z
    .string()
    .min(1, "Bot token is required")
    .regex(/^\d+:[A-Za-z0-9_-]{35,}$/, "Invalid Telegram bot token format"),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID"),
  content: z.string().min(1, "Message cannot be empty").max(4096, "Message too long"),
});

export type ConnectTelegramInput = z.infer<typeof connectTelegramSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
