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

/**
 * Lifecycle stage of the in-progress order, as the conversational agent sees it
 * this turn. This is what turns Mo'een from a one-shot extractor into a
 * multi-turn order-taker — the pipeline routes on it:
 *
 *   - "none"             — the message carries no order (a question or chit-chat).
 *   - "collecting"       — an order is forming but something required is still
 *                          missing OR not fulfillable (e.g. out of stock); the
 *                          agent is still asking for details.
 *   - "ready_to_confirm" — every required field is present AND every item is
 *                          fulfillable; the agent has read the order back and
 *                          asked the customer to confirm.
 *   - "confirmed"        — the customer affirmatively agreed to a readback the
 *                          agent already sent on a prior turn. Only now may the
 *                          pipeline commit a real order.
 *   - "cancelled"        — the customer called the order off.
 */
const orderStageSchema = z.enum([
  "none",
  "collecting",
  "ready_to_confirm",
  "confirmed",
  "cancelled",
]);

/** Union of the order lifecycle stages emitted by the AI each turn. */
export type OrderStage = z.infer<typeof orderStageSchema>;

export const geminiResponseSchema = z.object({
  intent: z.enum(["order", "question", "other"]),
  confidence: z.number().min(0).max(1),
  items: z.array(geminiItemSchema),
  customer_info: customerInfoSchema,
  missing_fields: z.array(z.string()),
  reasoning: z.string(),

  // --- Conversational agent fields (prompt v3) ---
  /** Where this in-progress order stands after merging the new message. */
  order_stage: orderStageSchema,
  /**
   * The single message the AI sends this turn (question, availability notice,
   * order readback, acknowledgement, or answer), already in the customer's
   * language. null when no reply should be sent.
   */
  reply_to_customer: z.string().nullable(),
  /**
   * True ONLY for genuine escalation — the customer explicitly asked for a
   * human, or the request is truly stuck / out of scope. NOT a low-confidence
   * signal (confidence has its own field + the pipeline's threshold).
   */
  needs_human: z.boolean(),

  // --- Deprecated (kept optional so pre-v3 stored `ai_result` payloads still
  // parse). The v3 conversational flow uses `reply_to_customer` / `needs_human`
  // and recomputes totals deterministically in validate-extraction. ---
  /** @deprecated v3 folds the clarifying question into `reply_to_customer`. */
  clarifying_question: z.string().nullable().optional(),
  /** @deprecated v3 folds the question answer into `reply_to_customer`. */
  answer: z.string().nullable().optional(),
  /** @deprecated v3 uses `needs_human` for escalation only. */
  needs_human_review: z.boolean().optional(),
  /** @deprecated totals are recomputed from validated items, never trusted. */
  order_total: z.number().nullable().optional(),
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
  customerContext: string;
  customerProfile: {
    name: string | null;
    phone: string | null;
    deliveryAddress: string | null;
  };
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
