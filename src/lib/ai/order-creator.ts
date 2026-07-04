import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeminiResponse, CompressedProduct } from "./types";
import { validateExtraction } from "./validate-extraction";
import type { ValidationDiagnostics } from "./validate-extraction";

interface CreateOrderParams {
  merchantId: string;
  customerId: string;
  conversationId: string;
  messageId: string;
  geminiResponse: GeminiResponse;
  /** The exact product set sent to Gemini — used to validate product_ids/prices. */
  catalog: CompressedProduct[];
  /** Merchant currency from settings — replaces the old hardcoded "ILS". */
  currency: string;
}

interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  /** What deterministic validation had to correct — surfaced by the caller. */
  diagnostics: ValidationDiagnostics;
}

/**
 * Create an order + order_items + timeline entry from a Gemini extraction.
 *
 * Idempotent at the order level: if an order already exists for this
 * source message (e.g. the reprocess endpoint re-runs the pipeline), the
 * existing order is returned instead of creating a duplicate.
 */
export async function createOrderFromAI(
  supabase: SupabaseClient,
  params: CreateOrderParams
): Promise<CreateOrderResult> {
  const {
    merchantId,
    customerId,
    conversationId,
    messageId,
    geminiResponse,
    catalog,
    currency,
  } = params;

  // --- Idempotency: never mint a second order for the same source message ---
  const { data: existing } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("merchant_id", merchantId)
    .eq("source_message_id", messageId)
    .maybeSingle();

  if (existing) {
    console.log(
      "[AI Pipeline] order already exists for message → skipping create"
    );
    return {
      orderId: existing.id,
      orderNumber: existing.order_number,
      diagnostics: { invalidProductIds: [], priceCorrections: 0 },
    };
  }

  // --- Deterministic validation (Gemini output is untrusted) ---
  const validation = validateExtraction(geminiResponse, catalog);

  const { data: numberData } = await supabase.rpc("generate_order_number", {
    p_merchant_id: merchantId,
  });
  const orderNumber = numberData as string;

  // Totals come from the sanitized items, not from Gemini.
  const { subtotal, total, items: validatedItems, diagnostics } = validation;

  // Insert order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      merchant_id: merchantId,
      customer_id: customerId,
      conversation_id: conversationId,
      order_number: orderNumber,
      status: "incoming",
      delivery_address:
        geminiResponse.customer_info.delivery_address ?? null,
      subtotal,
      total,
      currency,
      notes: geminiResponse.reasoning,
      ai_confidence: geminiResponse.confidence,
      ai_extracted: true,
      source_message_id: messageId,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    throw new Error(
      `Failed to create order: ${orderError?.message ?? "unknown error"}`
    );
  }

  // Insert order items
  if (validatedItems.length > 0) {
    const items = validatedItems.map((item) => ({
      merchant_id: merchantId,
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      variant: item.variant,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
      ai_confidence: item.match_confidence,
      ai_matched: item.product_id !== null,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(items);

    if (itemsError) {
      // A live order with zero items is a silent data-loss failure — make it
      // merchant-visible instead of only logging it.
      console.error("[AI Pipeline] Failed to insert order items:", itemsError);
      await supabase.from("flags").insert({
        merchant_id: merchantId,
        order_id: order.id,
        conversation_id: conversationId,
        message_id: messageId,
        priority: "critical",
        category: "ai_unavailable",
        title: "Order created without items",
        description: `The order was created but its items failed to save. Error: ${itemsError.message}`,
        recommended_action:
          "Open the order and add items manually from the conversation.",
      });
    }
  }

  // Insert timeline entry
  const { error: timelineError } = await supabase
    .from("order_timeline")
    .insert({
      merchant_id: merchantId,
      order_id: order.id,
      from_status: null,
      to_status: "incoming",
      changed_by: "ai",
      note: `AI-extracted order (confidence: ${(geminiResponse.confidence * 100).toFixed(0)}%)`,
    });

  if (timelineError) {
    console.error("[AI Pipeline] Failed to insert timeline:", timelineError);
  }

  return { orderId: order.id, orderNumber, diagnostics };
}
