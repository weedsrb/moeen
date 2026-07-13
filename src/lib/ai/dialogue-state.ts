import { resolveRequiredMissingFields } from "./order-policy";
import {
  getStockShortfalls,
  isFinalizable,
  validateExtraction,
  type StockShortfall,
  type ValidationResult,
} from "./validate-extraction";
import type {
  AIRequestV1,
  AssistantTurnV1,
  GeminiResponse,
  OrderStage,
} from "./types";

export interface ResolvedAssistantTurn {
  /** Compatibility payload for the existing persistence layer. */
  extraction: GeminiResponse;
  stage: OrderStage;
  validation: ValidationResult;
  missingFields: string[];
  stockShortfalls: StockShortfall[];
  finalizable: boolean;
  needsHuman: boolean;
  invalidFactRefs: string[];
  confirmationRejected: boolean;
}

/**
 * Pure deterministic reducer. The model can propose language and a small delta,
 * but cannot set lifecycle state, prices, totals, missing fields, confirmation
 * validity, or executable actions.
 */
export function reduceAssistantTurn(params: {
  turn: AssistantTurnV1;
  request: AIRequestV1;
  canAcceptConfirmation: boolean;
}): ResolvedAssistantTurn {
  const { turn, request, canAcceptConfirmation } = params;
  const productsById = new Map(
    request.facts.products.map((product) => [product.id, product])
  );
  const items = new Map<string, GeminiResponse["items"][number]>(
    request.order.items
      .filter((item) => item.product_id !== null)
      .map((item) => [
        item.product_id as string,
        {
          product_id: item.product_id,
          product_name: item.name,
          variant: item.variant,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.unit_price * item.quantity,
          match_confidence: 1,
        },
      ])
  );

  for (const productId of turn.order_patch.remove_product_ids ?? []) {
    items.delete(productId);
  }
  for (const patch of turn.order_patch.add_or_update_items ?? []) {
    const product = productsById.get(patch.product_id);
    items.set(patch.product_id, {
      product_id: patch.product_id,
      product_name: product?.name ?? patch.product_id,
      variant: patch.variant ?? null,
      quantity: patch.quantity,
      unit_price: product?.price ?? null,
      subtotal: product ? product.price * patch.quantity : null,
      match_confidence: product ? 1 : 0,
    });
  }

  const customer = {
    name: turn.order_patch.customer_name ?? request.customer.name,
    phone: turn.order_patch.phone ?? request.customer.phone,
    delivery_address:
      turn.order_patch.delivery_address ??
      request.order.delivery_address ??
      request.customer.known_address,
  };
  const requestedCustomerFields = request.business.required_customer_fields;
  const customerMissing = resolveRequiredMissingFields({
    modelMissingFields: [],
    requireCustomerName: requestedCustomerFields.includes("name"),
    requireCustomerPhone: requestedCustomerFields.includes("phone"),
    customer: {
      name: customer.name,
      phone: customer.phone,
      deliveryAddress: customer.delivery_address,
    },
  });
  const itemMissing: string[] = [];
  if (items.size === 0) itemMissing.push("products");
  for (const item of items.values()) {
    const product = item.product_id
      ? productsById.get(item.product_id)
      : undefined;
    if (product?.variants.length && !item.variant) {
      itemMissing.push(`variant:${product.id}`);
    }
  }
  const missingFields = [...new Set([...itemMissing, ...customerMissing])];

  const extraction: GeminiResponse = {
    intent: turn.intent === "conversation" ? "other" : turn.intent,
    order_stage: "none",
    confidence: 1,
    items: [...items.values()],
    customer_info: customer,
    missing_fields: missingFields,
    reply_to_customer: turn.reply,
    needs_human: turn.needs_human || turn.dialogue_act === "handoff",
    reasoning: turn.uncertainty_codes.join(",").slice(0, 100),
  };

  const validation = validateExtraction(extraction, request.facts.products);
  const finalizable = isFinalizable(validation, missingFields);
  const knownFactRefs = new Set([
    ...request.facts.products.map((product) => product.id),
    ...request.facts.faqs.map((_, index) => `faq:${index}`),
  ]);
  const invalidFactRefs = turn.fact_refs.filter((ref) => !knownFactRefs.has(ref));
  const ungroundedQuestion =
    turn.intent === "question" && Boolean(turn.reply) && turn.fact_refs.length === 0;
  const needsHuman =
    extraction.needs_human || invalidFactRefs.length > 0 || ungroundedQuestion;
  const confirmationRejected =
    turn.dialogue_act === "confirm" && !canAcceptConfirmation;

  let stage: OrderStage;
  if (turn.intent !== "order") stage = "none";
  else if (turn.dialogue_act === "cancel") stage = "cancelled";
  else if (
    turn.dialogue_act === "confirm" &&
    canAcceptConfirmation &&
    finalizable &&
    !needsHuman
  ) {
    stage = "confirmed";
  } else if (finalizable && !needsHuman) {
    stage = "ready_to_confirm";
  } else {
    stage = "collecting";
  }
  extraction.order_stage = stage;
  extraction.needs_human = needsHuman;

  return {
    extraction,
    stage,
    validation,
    missingFields,
    stockShortfalls: getStockShortfalls(validation, request.facts.products),
    finalizable,
    needsHuman,
    invalidFactRefs,
    confirmationRejected,
  };
}
