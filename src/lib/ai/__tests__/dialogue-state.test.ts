import { describe, expect, it } from "vitest";
import { reduceAssistantTurn } from "../dialogue-state";
import type { AIRequestV1, AssistantTurnV1 } from "../types";
import { catalogFixture } from "../testing/fixtures";

function requestFixture(): AIRequestV1 {
  return {
    v: 1,
    business: {
      name: "زيت وزعتر",
      currency: "ILS",
      tone: "warm",
      reply_language: "auto",
      required_customer_fields: ["delivery_address"],
    },
    admin_policy: {
      assistant_name: null,
      greeting: null,
      business_context: null,
      custom_instructions: null,
    },
    customer: {
      name: null,
      phone: null,
      known_address: "رام الله",
      language: "ar",
    },
    conversation: { mode: "ai", summary: "", awaiting: null },
    order: {
      id: null,
      items: [],
      delivery_address: null,
      total: 0,
      missing: [],
      last_readback: null,
    },
    facts: { products: catalogFixture, faqs: [] },
    recent: [],
    current: { message_ids: ["msg_1"], text: "عبوتين زيت" },
  };
}

function turnFixture(overrides: Partial<AssistantTurnV1> = {}): AssistantTurnV1 {
  return {
    intent: "order",
    dialogue_act: "adjust_order",
    reply: "تمام",
    needs_human: false,
    requested_field: null,
    order_patch: {
      add_or_update_items: [
        { product_id: "olive-oil-1l", quantity: 2, variant: null },
      ],
    },
    fact_refs: ["olive-oil-1l"],
    uncertainty_codes: [],
    ...overrides,
  };
}

describe("deterministic AssistantTurnV1 reducer", () => {
  it("derives catalog prices, totals, and ready state without model-owned values", () => {
    const result = reduceAssistantTurn({
      turn: turnFixture(),
      request: requestFixture(),
      canAcceptConfirmation: false,
    });

    expect(result.stage).toBe("ready_to_confirm");
    expect(result.validation.total).toBe(90);
    expect(result.extraction.items[0]).toMatchObject({
      product_id: "olive-oil-1l",
      unit_price: 45,
      subtotal: 90,
    });
  });

  it("rejects confirmation unless it is tied to the persisted latest readback", () => {
    const rejected = reduceAssistantTurn({
      turn: turnFixture({ dialogue_act: "confirm" }),
      request: requestFixture(),
      canAcceptConfirmation: false,
    });
    const accepted = reduceAssistantTurn({
      turn: turnFixture({ dialogue_act: "confirm" }),
      request: requestFixture(),
      canAcceptConfirmation: true,
    });

    expect(rejected.confirmationRejected).toBe(true);
    expect(rejected.stage).toBe("ready_to_confirm");
    expect(accepted.stage).toBe("confirmed");
  });

  it("never finalizes unknown products or invalid fact references", () => {
    const result = reduceAssistantTurn({
      turn: turnFixture({
        order_patch: {
          add_or_update_items: [{ product_id: "invented", quantity: 1 }],
        },
        fact_refs: ["invented"],
      }),
      request: requestFixture(),
      canAcceptConfirmation: true,
    });

    expect(result.stage).toBe("collecting");
    expect(result.finalizable).toBe(false);
    expect(result.needsHuman).toBe(true);
    expect(result.validation.diagnostics.invalidProductIds).toEqual([
      "invented",
    ]);
  });

  it("hands off a factual answer that cites no supplied backend fact", () => {
    const result = reduceAssistantTurn({
      turn: turnFixture({
        intent: "question",
        dialogue_act: "answer",
        reply: "Our return policy is 30 days.",
        order_patch: {},
        fact_refs: [],
      }),
      request: requestFixture(),
      canAcceptConfirmation: false,
    });

    expect(result.stage).toBe("none");
    expect(result.needsHuman).toBe(true);
  });
});
