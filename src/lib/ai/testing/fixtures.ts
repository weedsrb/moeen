import type { GeminiResponse, CompressedProduct } from "../types";

export const catalogFixture: CompressedProduct[] = [
  {
    id: "olive-oil-1l",
    name: "زيت زيتون 1 لتر",
    alt: ["زيت بلدي", "olive oil"],
    price: 45,
    variants: [],
    stock: 8,
  },
  {
    id: "knafeh-tray",
    name: "كنافة",
    alt: ["knafeh"],
    price: 30,
    variants: ["Size: small, large"],
    stock: 2,
  },
];

export function geminiResponseFixture(
  overrides: Partial<GeminiResponse> = {}
): GeminiResponse {
  return {
    intent: "order",
    confidence: 0.9,
    items: [
      {
        product_id: "olive-oil-1l",
        product_name: "زيت زيتون 1 لتر",
        variant: null,
        quantity: 2,
        unit_price: 999,
        subtotal: 1998,
        match_confidence: 0.95,
      },
    ],
    customer_info: {
      name: "أحمد",
      phone: "0599000000",
      delivery_address: "رام الله، المصايف",
    },
    missing_fields: [],
    reasoning: "order understood",
    order_stage: "ready_to_confirm",
    reply_to_customer: "أؤكد الطلب؟",
    needs_human: false,
    ...overrides,
  };
}
