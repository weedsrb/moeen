import { describe, expect, it } from "vitest";
import { isExplicitHumanRequest } from "../human-takeover";

describe("explicit human takeover detection", () => {
  it.each([
    "بدي احكي مع موظف",
    "ممكن تحولني لشخص حقيقي؟",
    "اريد المدير",
    "I need a human agent",
    "please connect me to a representative",
  ])("recognizes a direct human request: %s", (message) => {
    expect(isExplicitHumanRequest(message)).toBe(true);
  });

  it.each([
    "بدي اطلب كنافة",
    "هل عندكم توصيل؟",
    "I need two olive oils",
    "شكرا",
  ])("does not take over ordinary customer messages: %s", (message) => {
    expect(isExplicitHumanRequest(message)).toBe(false);
  });
});
