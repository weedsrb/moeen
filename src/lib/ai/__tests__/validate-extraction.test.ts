import { describe, expect, it } from "vitest";
import {
  getStockShortfalls,
  hasHardAvailabilityProblem,
  isFinalizable,
  validateExtraction,
} from "../validate-extraction";
import { catalogFixture, geminiResponseFixture } from "../testing/fixtures";

describe("validateExtraction", () => {
  it("replaces model prices and totals with catalog truth", () => {
    const result = validateExtraction(geminiResponseFixture(), catalogFixture);

    expect(result.items[0]).toMatchObject({
      product_id: "olive-oil-1l",
      quantity: 2,
      unit_price: 45,
      subtotal: 90,
    });
    expect(result.total).toBe(90);
    expect(result.diagnostics.priceCorrections).toBe(1);
    expect(isFinalizable(result, [])).toBe(true);
  });

  it("drops hallucinated product ids and blocks finalization", () => {
    const response = geminiResponseFixture({
      items: [
        {
          product_id: "invented-product",
          product_name: "منتج خيالي",
          variant: null,
          quantity: 1,
          unit_price: 10,
          subtotal: 10,
          match_confidence: 0.8,
        },
      ],
    });

    const result = validateExtraction(response, catalogFixture);

    expect(result.items[0].product_id).toBeNull();
    expect(result.diagnostics.invalidProductIds).toEqual(["invented-product"]);
    expect(hasHardAvailabilityProblem(result)).toBe(true);
    expect(isFinalizable(result, [])).toBe(false);
  });

  it("reports stock shortfalls and invalid variants", () => {
    const response = geminiResponseFixture({
      items: [
        {
          product_id: "knafeh-tray",
          product_name: "كنافة",
          variant: "medium",
          quantity: 3,
          unit_price: 30,
          subtotal: 90,
          match_confidence: 0.9,
        },
      ],
    });

    const result = validateExtraction(response, catalogFixture);

    expect(result.diagnostics.outOfStockItems).toHaveLength(1);
    expect(result.diagnostics.invalidVariants).toEqual(["كنافة: medium"]);
    expect(getStockShortfalls(result, catalogFixture)).toEqual([
      { productName: "كنافة", requested: 3, available: 2 },
    ]);
    expect(isFinalizable(result, [])).toBe(false);
  });

  it("blocks otherwise-valid orders while required fields are missing", () => {
    const result = validateExtraction(geminiResponseFixture(), catalogFixture);
    expect(isFinalizable(result, ["delivery_address"])).toBe(false);
  });
});
