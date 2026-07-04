import type { GeminiResponse, CompressedProduct } from "./types";

/**
 * A single order item after deterministic validation against the catalog.
 * unit_price/subtotal are always resolved to a concrete number (never null),
 * so callers can insert them directly.
 */
export interface ValidatedItem {
  product_id: string | null;
  product_name: string;
  variant: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  match_confidence: number;
}

/** Diagnostics describing what the validator had to correct. */
export interface ValidationDiagnostics {
  /** product_ids Gemini returned that do not exist in the catalog we sent. */
  invalidProductIds: string[];
  /** Number of items whose price/subtotal we recomputed from the catalog. */
  priceCorrections: number;
}

export interface ValidationResult {
  items: ValidatedItem[];
  subtotal: number;
  total: number;
  diagnostics: ValidationDiagnostics;
}

/**
 * Deterministically validate a Gemini extraction against the exact product
 * catalog that was sent to Gemini. Gemini output is untrusted — it can
 * hallucinate product_ids and invent prices — so we:
 *
 *   1. Allow-list product_id against the catalog (unknown ids → null/unmatched).
 *   2. Recompute unit_price/subtotal from the authoritative catalog price for
 *      matched items; unmatched items keep Gemini's numbers (no catalog price).
 *   3. Recompute order totals from the sanitized items (never trust order_total).
 *
 * Pure function: no AI, no I/O.
 */
export function validateExtraction(
  geminiResponse: GeminiResponse,
  catalog: CompressedProduct[]
): ValidationResult {
  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  const invalidProductIds: string[] = [];
  let priceCorrections = 0;

  const items: ValidatedItem[] = geminiResponse.items.map((item) => {
    let productId = item.product_id;
    let unitPrice = item.unit_price ?? 0;
    let subtotal = item.subtotal ?? 0;

    if (productId !== null) {
      const product = catalogById.get(productId);
      if (!product) {
        // Rule 1: hallucinated product_id → drop the match, keep Gemini's
        // numbers (there's no authoritative catalog price to substitute).
        invalidProductIds.push(productId);
        productId = null;
      } else {
        // Rule 2: recompute price/subtotal from the authoritative catalog.
        const recomputedUnit = product.price;
        const recomputedSubtotal = item.quantity * recomputedUnit;
        if (
          recomputedUnit !== item.unit_price ||
          recomputedSubtotal !== item.subtotal
        ) {
          priceCorrections++;
        }
        unitPrice = recomputedUnit;
        subtotal = recomputedSubtotal;
      }
    }

    return {
      product_id: productId,
      product_name: item.product_name,
      variant: item.variant,
      quantity: item.quantity,
      unit_price: unitPrice,
      subtotal,
      match_confidence: item.match_confidence,
    };
  });

  // Rule 3: recompute totals from the sanitized items.
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const total = subtotal;

  return {
    items,
    subtotal,
    total,
    diagnostics: { invalidProductIds, priceCorrections },
  };
}
