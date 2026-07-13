import { z } from "zod/v4";

export const updateAISettingsSchema = z.object({
  ai_confidence_threshold: z.number().min(0.3).max(0.95).optional(),
  ai_auto_clarify: z.boolean().optional(),
  ai_handoff_message: z.string().min(1).max(500).optional(),
  ai_persona_name: z.string().max(50).nullable().optional(),
  ai_tone: z.enum(["formal", "friendly", "casual"]).optional(),
  ai_greeting: z.string().max(200).nullable().optional(),
  ai_business_context: z.string().max(1000).nullable().optional(),
  ai_custom_instructions: z.string().max(1000).nullable().optional(),
  ai_response_language: z.enum(["auto", "ar", "en"]).optional(),
  ai_auto_acknowledge: z.boolean().optional(),
  ai_acknowledge_template: z.string().max(500).nullable().optional(),
  ai_require_customer_name: z.boolean().optional(),
  ai_require_customer_phone: z.boolean().optional(),
  ai_acknowledgement_mode: z.enum(["off", "delayed"]).optional(),
  ai_ack_delay_seconds: z.number().int().min(5).max(60).optional(),
});

// Cap on the number of FAQ rows a merchant can create. Each row is injected
// verbatim into the Gemini system prompt, so an unbounded row count would bloat
// the prompt. Length per row is already capped by createFAQSchema.
export const MAX_FAQ_ENTRIES = 50;

export const createFAQSchema = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(1000),
  display_order: z.number().int().min(0).optional(),
});

export const updateFAQSchema = z.object({
  question: z.string().min(1).max(300).optional(),
  answer: z.string().min(1).max(1000).optional(),
  display_order: z.number().int().min(0).optional(),
});

export type UpdateAISettingsInput = z.infer<typeof updateAISettingsSchema>;
export type CreateFAQInput = z.infer<typeof createFAQSchema>;
export type UpdateFAQInput = z.infer<typeof updateFAQSchema>;
