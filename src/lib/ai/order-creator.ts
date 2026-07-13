import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeminiResponse, CompressedProduct } from "./types";
import { validateExtraction } from "./validate-extraction";
import type {
  ValidationDiagnostics,
  ValidatedItem,
} from "./validate-extraction";
import { canTransition } from "@/types/order";
import type { OrderStatus } from "@/types/order";

interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  /** What deterministic validation had to correct — surfaced by the caller. */
  diagnostics: ValidationDiagnostics;
}

// ============================================================
// Collecting-order lifecycle (conversational, multi-turn)
// ============================================================
//
// A `collecting` order is the in-progress draft the AI assembles across a
// multi-turn chat before it graduates into a real `incoming` order. There is at
// most ONE open `collecting` order per conversation — the pipeline passes its id
// (looked up in context assembly) so we upsert the same draft every turn instead
// of minting a new one. A collecting order reserves no stock and burns no quota
// (migration 019), so upserting it freely is safe.

/**
 * The AI's working state for a `collecting` order, snapshotted into
 * `orders.ai_collection_state` so a multi-turn collection is inspectable and can
 * resume. Not read by the UI yet — advisory metadata.
 */
export interface CollectionState {
  /** Required order fields still unknown this turn. */
  missing_fields: string[];
  /** True once we've read the order back and are waiting on a yes/no. */
  awaiting_confirmation: boolean;
  /** The last readback message shown to the customer, if any. */
  last_readback: string | null;
  /** Grounded customer details retained while the order is still collecting. */
  customer_info?: {
    name: string | null;
    phone: string | null;
    delivery_address: string | null;
  };
}

interface UpsertCollectingParams {
  merchantId: string;
  customerId: string;
  conversationId: string;
  messageId: string;
  geminiResponse: GeminiResponse;
  /** The exact product set sent to Gemini — used to validate product_ids/prices. */
  catalog: CompressedProduct[];
  /** Merchant currency from settings. */
  currency: string;
  /** id of the conversation's open collecting order, or null to create one. */
  collectingOrderId: string | null;
  /** Working state to persist into ai_collection_state. */
  collectionState: CollectionState;
}

/**
 * Create or overwrite the conversation's single open `collecting` order from the
 * latest Gemini extraction. When `collectingOrderId` is null a new draft is
 * minted (status `collecting`, ai_extracted true); otherwise the existing draft
 * is updated in place — its order_items are fully replaced (delete + re-insert)
 * and its delivery_address / notes / totals / ai_collection_state overwritten
 * with the full running order (the Gemini contract re-emits the complete order
 * every turn). Returns the order id + number + validation diagnostics so
 * callers can surface the same flags.
 */
export async function upsertCollectingOrder(
  supabase: SupabaseClient,
  params: UpsertCollectingParams
): Promise<CreateOrderResult> {
  const {
    merchantId,
    customerId,
    conversationId,
    messageId,
    geminiResponse,
    catalog,
    currency,
    collectingOrderId,
    collectionState,
  } = params;

  // Deterministic validation (Gemini output is untrusted).
  const validation = validateExtraction(geminiResponse, catalog);
  const { subtotal, total, items: validatedItems, diagnostics } = validation;
  const deliveryAddress =
    geminiResponse.customer_info.delivery_address ?? null;
  // jsonb column — passed as a plain object.
  const aiCollectionState = {
    missing_fields: collectionState.missing_fields,
    awaiting_confirmation: collectionState.awaiting_confirmation,
    last_readback: collectionState.last_readback,
    customer_info: collectionState.customer_info ?? {
      name: geminiResponse.customer_info.name ?? null,
      phone: geminiResponse.customer_info.phone ?? null,
      delivery_address: deliveryAddress,
    },
  };

  // --- Update path: overwrite the existing open draft ---
  if (collectingOrderId !== null) {
    const { data: existing } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", collectingOrderId)
      .eq("merchant_id", merchantId)
      .maybeSingle();

    // Full replace of the line items — the running order is re-emitted whole.
    const { error: deleteError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", collectingOrderId)
      .eq("merchant_id", merchantId);
    if (deleteError) {
      console.error(
        "[AI Pipeline] Failed to clear collecting order items:",
        deleteError
      );
    }

    await insertOrderItems(supabase, {
      merchantId,
      orderId: collectingOrderId,
      conversationId,
      messageId,
      validatedItems,
    });

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        delivery_address: deliveryAddress,
        subtotal,
        total,
        notes: geminiResponse.reasoning,
        ai_confidence: geminiResponse.confidence,
        ai_collection_state: aiCollectionState,
      })
      .eq("id", collectingOrderId)
      .eq("merchant_id", merchantId);
    if (updateError) {
      console.error(
        "[AI Pipeline] Failed to update collecting order:",
        updateError
      );
    }

    return {
      orderId: collectingOrderId,
      orderNumber: existing?.order_number ?? "",
      diagnostics,
    };
  }

  // --- Create path ---
  // Idempotency: never mint a second draft for the same source message (guards
  // the reprocess endpoint re-running on the creating message).
  const { data: dupe } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("merchant_id", merchantId)
    .eq("source_message_id", messageId)
    .maybeSingle();
  if (dupe) {
    console.log(
      "[AI Pipeline] collecting order already exists for message → skipping create"
    );
    return {
      orderId: dupe.id,
      orderNumber: dupe.order_number,
      diagnostics,
    };
  }

  const { data: numberData } = await supabase.rpc("generate_order_number", {
    p_merchant_id: merchantId,
  });
  const orderNumber = numberData as string;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      merchant_id: merchantId,
      customer_id: customerId,
      conversation_id: conversationId,
      order_number: orderNumber,
      status: "collecting",
      delivery_address: deliveryAddress,
      subtotal,
      total,
      currency,
      notes: geminiResponse.reasoning,
      ai_confidence: geminiResponse.confidence,
      ai_extracted: true,
      ai_collection_state: aiCollectionState,
      source_message_id: messageId,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    throw new Error(
      `Failed to create collecting order: ${orderError?.message ?? "unknown error"}`
    );
  }

  await insertOrderItems(supabase, {
    merchantId,
    orderId: order.id,
    conversationId,
    messageId,
    validatedItems,
  });

  const confidencePct = (geminiResponse.confidence * 100).toFixed(0);
  const { error: timelineError } = await supabase
    .from("order_timeline")
    .insert({
      merchant_id: merchantId,
      order_id: order.id,
      from_status: null,
      to_status: "collecting",
      changed_by: "ai",
      note: `AI is collecting this order (confidence: ${confidencePct}%)`,
    });
  if (timelineError) {
    console.error(
      "[AI Pipeline] Failed to insert collecting timeline:",
      timelineError
    );
  }

  return { orderId: order.id, orderNumber, diagnostics };
}

/**
 * Graduate a `collecting` draft into a live `incoming` order once the customer
 * has confirmed. Guarded: only transitions when the order is still `collecting`
 * (an already-promoted/cancelled order is a no-op). Clears ai_collection_state
 * and writes a timeline entry attributed to the AI. Never throws — a promotion
 * failure only logs, consistent with the pipeline's fire-and-forget pattern.
 */
export async function promoteCollectingToIncoming(
  supabase: SupabaseClient,
  orderId: string,
  merchantId: string
): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (!order) {
    console.error(`[AI Pipeline] promote | order ${orderId} not found`);
    return;
  }
  const from = order.status as OrderStatus;
  if (from !== "collecting" || !canTransition(from, "incoming")) {
    console.log(
      `[AI Pipeline] promote | skipped — order not collecting (status=${from})`
    );
    return;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "incoming", ai_collection_state: null })
    .eq("id", orderId)
    .eq("merchant_id", merchantId);
  if (updateError) {
    console.error(
      `[AI Pipeline] promote | update failed: ${updateError.message}`
    );
    return;
  }

  const { error: timelineError } = await supabase
    .from("order_timeline")
    .insert({
      merchant_id: merchantId,
      order_id: orderId,
      from_status: "collecting",
      to_status: "incoming",
      changed_by: "ai",
      note: "AI order confirmed by customer",
    });
  if (timelineError) {
    console.error(
      `[AI Pipeline] promote | timeline failed: ${timelineError.message}`
    );
  }
}

/**
 * Cancel a `collecting` draft when the customer calls the order off. Guarded to
 * only act on a still-`collecting` order; clears ai_collection_state and writes
 * an AI-attributed timeline entry. Never throws.
 */
export async function cancelCollectingOrder(
  supabase: SupabaseClient,
  orderId: string,
  merchantId: string
): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (!order) {
    console.error(`[AI Pipeline] cancel | order ${orderId} not found`);
    return;
  }
  const from = order.status as OrderStatus;
  if (from !== "collecting" || !canTransition(from, "cancelled")) {
    console.log(
      `[AI Pipeline] cancel | skipped — order not collecting (status=${from})`
    );
    return;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "cancelled", ai_collection_state: null })
    .eq("id", orderId)
    .eq("merchant_id", merchantId);
  if (updateError) {
    console.error(
      `[AI Pipeline] cancel | update failed: ${updateError.message}`
    );
    return;
  }

  const { error: timelineError } = await supabase
    .from("order_timeline")
    .insert({
      merchant_id: merchantId,
      order_id: orderId,
      from_status: "collecting",
      to_status: "cancelled",
      changed_by: "ai",
      note: "Order cancelled by customer",
    });
  if (timelineError) {
    console.error(
      `[AI Pipeline] cancel | timeline failed: ${timelineError.message}`
    );
  }
}

/**
 * Map validated items into order_items rows and insert them. A live order
 * with zero items is a silent data-loss failure, so an insert error is
 * surfaced as a merchant flag, not just logged. No-op when there are no
 * items.
 */
async function insertOrderItems(
  supabase: SupabaseClient,
  params: {
    merchantId: string;
    orderId: string;
    conversationId: string;
    messageId: string;
    validatedItems: ValidatedItem[];
  }
): Promise<void> {
  const { merchantId, orderId, conversationId, messageId, validatedItems } =
    params;
  if (validatedItems.length === 0) return;

  const items = validatedItems.map((item) => ({
    merchant_id: merchantId,
    order_id: orderId,
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
    console.error("[AI Pipeline] Failed to insert order items:", itemsError);
    await supabase.from("flags").insert({
      merchant_id: merchantId,
      order_id: orderId,
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
