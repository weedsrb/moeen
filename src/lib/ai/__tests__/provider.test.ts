import { afterEach, describe, expect, it } from "vitest";
import {
  AIProviderError,
  isRetryableAIProviderError,
  normalizeAIProviderError,
} from "../provider";
import { setAIProviderForTests } from "../provider-registry";
import { FakeAIProvider } from "../testing/fake-ai-provider";
import { classifyIntent } from "../classify-intent";

afterEach(() => setAIProviderForTests(null));

describe("provider error normalization", () => {
  it.each([
    [{ status: 429, message: "rate limited" }, "rate_limit"],
    [{ status: 503, message: "unavailable" }, "unavailable"],
    [new Error("request timed out"), "timeout"],
    [new Error("network fetch failed"), "network"],
  ])("marks transient failures retryable", (error, kind) => {
    const normalized = normalizeAIProviderError(error);
    expect(normalized.kind).toBe(kind);
    expect(isRetryableAIProviderError(error)).toBe(true);
  });

  it("does not retry authentication failures", () => {
    const error = normalizeAIProviderError({ status: 401, message: "bad key" });
    expect(error.kind).toBe("authentication");
    expect(error.retryable).toBe(false);
  });

  it("preserves an existing provider error", () => {
    const original = new AIProviderError({
      message: "invalid",
      kind: "invalid_request",
      retryable: false,
      status: 400,
    });
    expect(normalizeAIProviderError(original)).toBe(original);
  });
});

describe("classifier provider contract", () => {
  it("uses the provider with the classifier task settings", async () => {
    const provider = new FakeAIProvider();
    provider.enqueue({
      text: '{"intent":"order"}',
      metadata: {
        provider: "fake",
        model: "fake-classifier",
        task: "intent_classifier",
        finishReason: "stop",
        latencyMs: 1,
        usage: {
          inputTokens: 10,
          outputTokens: 3,
          totalTokens: 13,
          cachedInputTokens: 0,
        },
        effectiveSettings: {
          temperature: 0,
          maxOutputTokens: 64,
          reasoningBudget: null,
          streaming: false,
        },
      },
    });
    setAIProviderForTests(provider);

    await expect(classifyIntent("بدي زيت", "")).resolves.toBe("order");
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({
      task: "intent_classifier",
      temperature: 0,
      maxOutputTokens: 64,
      responseFormat: "json",
    });
  });
});
