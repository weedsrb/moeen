import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeminiResponse } from "./types";

interface CreateOrderParams {
  merchantId: string;
  customerId: string;
  conversationId: string;
  messageId: string;
  geminiResponse: GeminiResponse;
}

interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
}

/**
 * Create an order + order_items + timeline entry from a Gemini extraction.
 */
export async function createOrderFromAI(
  supabase: SupabaseClient,
  params: CreateOrderParams
): Promise<CreateOrderResult> {
  const { merchantId, customerId, conversationId, messageId, geminiResponse } =
    params;

  // Generate order number: MO-000001
  const { count } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("merchant_id", merchantId);

  const orderNumber = `MO-${String((count ?? 0) + 1).padStart(6, "0")}`;

  // Calculate totals from items
  const subtotal = geminiResponse.items.reduce(
    (sum, item) => sum + (item.subtotal ?? 0),
    0
  );
  const total = geminiResponse.order_total ?? subtotal;

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
      currency: "ILS",
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
  if (geminiResponse.items.length > 0) {
    const items = geminiResponse.items.map((item) => ({
      merchant_id: merchantId,
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      variant: item.variant,
      quantity: item.quantity,
      unit_price: item.unit_price ?? 0,
      subtotal: item.subtotal ?? 0,
      ai_confidence: item.match_confidence,
      ai_matched: item.product_id !== null,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(items);

    if (itemsError) {
      console.error("[AI Pipeline] Failed to insert order items:", itemsError);
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

  return { orderId: order.id, orderNumber };
}
