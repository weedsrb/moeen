import { describe, expect, it } from "vitest";
import { resolveRequiredMissingFields } from "../order-policy";

describe("merchant order requirements", () => {
  it("always requires an address but removes optional name and phone", () => {
    expect(
      resolveRequiredMissingFields({
        modelMissingFields: ["name", "phone"],
        requireCustomerName: false,
        requireCustomerPhone: false,
        customer: { name: null, phone: null, deliveryAddress: null },
      })
    ).toEqual(["delivery_address"]);
  });

  it("adds merchant-required fields deterministically", () => {
    expect(
      resolveRequiredMissingFields({
        modelMissingFields: [],
        requireCustomerName: true,
        requireCustomerPhone: true,
        customer: { name: null, phone: null, deliveryAddress: "رام الله" },
      })
    ).toEqual(["name", "phone"]);
  });

  it("uses known customer data to satisfy the policy", () => {
    expect(
      resolveRequiredMissingFields({
        modelMissingFields: ["delivery_address", "phone"],
        requireCustomerName: true,
        requireCustomerPhone: true,
        customer: {
          name: "أحمد",
          phone: "0599000000",
          deliveryAddress: "رام الله",
        },
      })
    ).toEqual([]);
  });
});
