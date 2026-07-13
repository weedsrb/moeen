import { describe, expect, it } from "vitest";
import {
  automationSignaturesMatch,
  bodyHash,
  createAutomationSignature,
  signaturePayload,
} from "../../automation/hmac";

describe("automation HMAC contract", () => {
  const input = {
    secret: "test-secret-at-least-32-bytes-long",
    method: "POST",
    pathname: "/api/internal/automation/jobs/claim",
    timestamp: "1783972800",
    body: '{"workflow_type":"new-order-alerts"}',
  };

  it("binds method, path, timestamp, and body hash", () => {
    const signature = createAutomationSignature(input);

    expect(signature).toHaveLength(64);
    expect(automationSignaturesMatch(input, signature)).toBe(true);
    expect(
      automationSignaturesMatch({ ...input, body: "{}" }, signature)
    ).toBe(false);
    expect(signaturePayload(input)).toContain(bodyHash(input.body));
  });
});
