import { z } from "zod/v4";

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID"),
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(4096, "Message too long"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
