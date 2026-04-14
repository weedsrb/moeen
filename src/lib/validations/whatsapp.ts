import { z } from "zod/v4";

export const connectWhatsAppSchema = z.object({
  phoneNumberId: z.string().min(1, "Phone Number ID is required"),
  accessToken: z.string().min(1, "Access token is required"),
  verifyToken: z.string().min(1, "Verify token is required"),
  businessAccountId: z.string().optional(),
});

export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;
