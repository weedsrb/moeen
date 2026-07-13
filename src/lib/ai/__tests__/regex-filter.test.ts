import { describe, expect, it } from "vitest";
import { shouldProcess } from "../regex-filter";

describe("legacy fail-open order filter", () => {
  it.each([
    "بدي 3 كنافة",
    "ابعثلي زيت بلدي",
    "I want two items",
    "biddi 2 knafeh",
    "كم سعر الكنافة؟",
  ])("recognizes an order or product question: %s", (message) => {
    expect(shouldProcess(message, null)).toBe(true);
  });

  it.each(["مرحبا", "thanks", "👍", ""]) (
    "bypasses cold-conversation noise: %s",
    (message) => {
      expect(shouldProcess(message, null)).toBe(false);
    }
  );

  it("always processes replies to an AI message", () => {
    expect(shouldProcess("نعم", "ai")).toBe(true);
  });

  it("treats a bare number as a likely quantity answer", () => {
    expect(shouldProcess("3", null)).toBe(true);
  });
});
