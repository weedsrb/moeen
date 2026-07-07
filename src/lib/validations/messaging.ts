import { z } from "zod/v4";

export const sendMessageSchema = z
  .object({
    conversationId: z.string().uuid("Invalid conversation ID"),
    content: z
      .string()
      .max(4096, "Message too long")
      .optional(),
    mediaUrl: z.string().url("Invalid media URL").optional(),
    messageType: z.enum(["text", "image"]).optional(),
    replyToMessageId: z.string().uuid("Invalid reply target").optional(),
  })
  .refine(
    (data) => (data.content && data.content.trim().length > 0) || !!data.mediaUrl,
    { message: "Message cannot be empty", path: ["content"] }
  );

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
