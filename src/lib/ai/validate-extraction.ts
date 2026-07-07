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
  /**
   * Matched items whose requested quantity exceeds the catalog stock, formatted
   * `"<product_name> (need <qty>, have <stock>)"`. NOT blocking — surfaced as a
   * merchant flag ("AI suggests, the merchant decides"). Optional so callers
   * that build a diagnostics literal without it (e.g. the order-creator
   * idempotency short-circuit) still type-check; validateExtraction always
   * populates it (default empty).
   */
  outOfStockItems?: string[];
  /**
   * Matched items whose Gemini-returned `variant` is not among the product's
   * offered variant options, formatted `"<product_name>: <variant>"`. Lenient:
   * products that define no variants at all are never flagged. Optional for the
   * same reason as `outOfStockItems`; validateExtraction always populates it.
   */
  invalidVariants?: string[];
}

/**
 * Flatten a CompressedProduct's variant strings into a case-insensitive set of
 * acceptable tokens. `variants` entries look like `"Size: S, M, L"` — both the
 * group NAME ("size") and every OPTION ("s", "m", "l") count as a valid match,
 * so a customer saying either "large" or "size" reconciles. Tokens are split on
 * ':' then ',' and lower-cased. Returns an empty set when no variants exist.
 */
function collectVariantTokens(variants: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const entry of variants) {
    // Split "Name: opt1, opt2" into the name and the options blob, then the
    // options on commas. Missing colon → treat the whole entry as options.
    const colonIdx = entry.indexOf(":");
    const namePart = colonIdx >= 0 ? entry.slice(0, colonIdx) : "";
    const optionsPart = colonIdx >= 0 ? entry.slice(colonIdx + 1) : entry;

    const name = namePart.trim();
    if (name) tokens.add(name.toLowerCase());

    for (const opt of optionsPart.split(",")) {
      const trimmed = opt.trim();
      if (trimmed) tokens.add(trimmed.toLowerCase());
    }
  }
  return tokens;
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
  const outOfStockItems: string[] = [];
  const invalidVariants: string[] = [];
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

        // Rule 4 (advisory, non-blocking): stock sufficiency. If the customer
        // asked for more than we have on hand, record it so the merchant can
        // reconcile before confirming — we do NOT refuse to create the order.
        if (product.stock < item.quantity) {
          outOfStockItems.push(
            `${product.name} (need ${item.quantity}, have ${product.stock})`
          );
        }

        // Rule 5 (advisory, non-blocking): variant sanity. Only check when the
        // extraction specified a variant AND the product actually offers
        // variants (products that don't track variants are never flagged).
        if (item.variant !== null && product.variants.length > 0) {
          const offered = collectVariantTokens(product.variants);
          if (!offered.has(item.variant.trim().toLowerCase())) {
            invalidVariants.push(`${product.name}: ${item.variant}`);
          }
        }
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
    diagnostics: {
      invalidProductIds,
      priceCorrections,
      outOfStockItems,
      invalidVariants,
    },
  };
}

// ------------------------------------------------------------
// Stage-gating helpers
// ------------------------------------------------------------
//
// The conversational stage machine (src/lib/ai/process.ts) must NEVER let the
// model upgrade an order to "confirmed"/"ready_to_confirm" past what the catalog
// actually allows. These promote the validator from advisory to stage-gating:
// they answer, deterministically, "does this order have a HARD availability
// problem?" and "is it finalizable?".
//
// A HARD availability problem is one that makes the order un-fulfillable as
// stated and therefore MUST force the stage back down to "collecting":
//   - an item left unmatched (product_id null — we don't know what it is),
//   - a matched item whose requested quantity exceeds available stock,
//   - a matched item with a variant the product does not offer.
// Price corrections are NOT hard problems (we silently fix them).

/** A matched item the customer asked for more of than we can supply. Structured
 *  (vs. the diagnostics string) so the pipeline can build a truthful
 *  availability reply naming the product and the real amount on hand. */
export interface StockShortfall {
  productName: string;
  requested: number;
  available: number;
}

/**
 * True when the validated extraction has any HARD availability problem
 * (unmatched item, quantity over stock, or an unoffered variant). Catalog-free:
 * it reads only the validator's own output, which was already computed against
 * the exact catalog sent to Gemini.
 */
export function hasHardAvailabilityProblem(
  validation: ValidationResult
): boolean {
  const { items, diagnostics } = validation;
  return (
    items.some((i) => i.product_id === null) ||
    (diagnostics.outOfStockItems?.length ?? 0) > 0 ||
    (diagnostics.invalidVariants?.length ?? 0) > 0
  );
}

/**
 * Whether a validated order may be finalized (promoted out of "collecting").
 * Requires: at least one item, every required field supplied (missingFields
 * empty), and NO hard availability problem. This is the deterministic gate the
 * pipeline pairs with the model's own "confirmed" stage before committing a
 * real order — the model can never talk its way past it.
 */
export function isFinalizable(
  validation: ValidationResult,
  missingFields: string[]
): boolean {
  return (
    missingFields.length === 0 &&
    validation.items.length > 0 &&
    !hasHardAvailabilityProblem(validation)
  );
}

/**
 * Structured list of matched items whose requested quantity exceeds available
 * stock, resolved against the catalog so the pipeline can tell the customer the
 * exact amount we can offer. Unmatched items are skipped (we have no stock for
 * an unknown product).
 */
export function getStockShortfalls(
  validation: ValidationResult,
  catalog: CompressedProduct[]
): StockShortfall[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const shortfalls: StockShortfall[] = [];
  for (const item of validation.items) {
    if (item.product_id === null) continue;
    const product = byId.get(item.product_id);
    if (!product) continue;
    if (product.stock < item.quantity) {
      shortfalls.push({
        productName: product.name,
        requested: item.quantity,
        available: product.stock,
      });
    }
  }
  return shortfalls;
}
