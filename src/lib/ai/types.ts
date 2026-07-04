import { z } from "zod/v4";
import type { SenderType } from "@/types/message";

// --- Gemini Response Schema (runtime validation) ---

const geminiItemSchema = z.object({
  product_id: z.string().nullable(),
  product_name: z.string(),
  variant: z.string().nullable(),
  quantity: z.number().int().positive().nullable().transform((v) => v ?? 1),
  unit_price: z.number().nullable(),
  subtotal: z.number().nullable(),
  match_confidence: z.number().min(0).max(1),
});

const customerInfoSchema = z.object({
  name: z.string().nullable().optional(),
  delivery_address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export const geminiResponseSchema = z.object({
  intent: z.enum(["order", "question", "other"]),
  confidence: z.number().min(0).max(1),
  items: z.array(geminiItemSchema),
  customer_info: customerInfoSchema,
  order_total: z.number().nullable(),
  missing_fields: z.array(z.string()),
  needs_human_review: z.boolean(),
  clarifying_question: z.string().nullable(),
  answer: z.string().nullable().optional(),
  reasoning: z.string(),
});

export type GeminiResponse = z.infer<typeof geminiResponseSchema>;
export type GeminiItem = z.infer<typeof geminiItemSchema>;

// --- Pipeline Input ---

export interface PipelineInput {
  messageId: string;
  merchantId: string;
  conversationId: string;
  customerId: string;
  content: string;
  chatId: string;
  /** Channel this message arrived on, e.g. "whatsapp" | "instagram". */
  platform: string;
  /** Opaque per-provider credentials consumed by getProvider(platform, credentials). */
  credentials: Record<string, string>;
  /** ISO timestamp of the triggering message's created_at — anchors the burst
   *  debounce window and (implicitly) the last-message-wins successor check. */
  messageCreatedAt: string;
  /** Skip burst debounce (sleep + successor check + gather). Set by the
   *  reprocess endpoint, which runs inline on a single historical message. */
  skipDebounce?: boolean;
}

// --- Compressed Catalog ---

export interface CompressedProduct {
  id: string;
  name: string;
  alt: string[];
  price: number;
  variants: string[];
  stock: number;
}

// --- Context Assembly Output ---

export interface AssembledContext {
  conversationHistory: string;
  catalog: CompressedProduct[];
  settings: {
    confidenceThreshold: number;
    autoClarity: boolean;
    handoffMessage: string;
    currency: string;
    personaName: string | null;
    tone: string;
    greeting: string | null;
    businessContext: string | null;
    customInstructions: string | null;
    responseLanguage: string;
    autoAcknowledge: boolean;
    acknowledgeTemplate: string | null;
  };
  merchantContext: string;
  lastOutboundSenderType: SenderType | null;
}
