import { describe, expect, it } from "vitest";
import { canAcceptConfirmation } from "../confirmation";
import { isGroundedProfileValue } from "../profile-grounding";

describe("confirmation authority", () => {
  it("accepts only the exact persisted readback as the latest AI outbound", () => {
    expect(
      canAcceptConfirmation(
        { awaiting_confirmation: true, last_readback: "Confirm order?" },
        { senderType: "ai", content: "Confirm order?" }
      )
    ).toBe(true);
  });

  it.each([
    [null, "ai", "Confirm order?"],
    [
      { awaiting_confirmation: false, last_readback: "Confirm order?" },
      "ai",
      "Confirm order?",
    ],
    [
      { awaiting_confirmation: true, last_readback: "Confirm order?" },
      "merchant",
      "Confirm order?",
    ],
    [
      { awaiting_confirmation: true, last_readback: "Confirm order?" },
      "ai",
      "Different message",
    ],
  ])("rejects missing, stale, or non-AI readbacks", (state, senderType, content) => {
    expect(
      canAcceptConfirmation(state, {
        senderType: senderType as "ai" | "merchant",
        content,
      })
    ).toBe(false);
  });
});

describe("customer profile grounding", () => {
  it("accepts values present in the current customer message", () => {
    expect(isGroundedProfileValue("رام الله، المصايف", "العنوان رام الله المصايف"))
      .toBe(true);
    expect(isGroundedProfileValue("0599-000-000", "رقمي 0599 000 000")).toBe(
      true
    );
  });

  it("rejects model-proposed profile values absent from the message", () => {
    expect(isGroundedProfileValue("نابلس", "العنوان رام الله")).toBe(false);
  });
});
