import type { AIProvider } from "./provider";
import { GeminiAIProvider } from "./providers/gemini-provider";

let singleton: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (singleton) return singleton;

  const configured = process.env.AI_PROVIDER?.trim().toLowerCase() || "gemini";
  if (configured !== "gemini") {
    throw new Error(`Unsupported AI_PROVIDER: ${configured}`);
  }

  singleton = new GeminiAIProvider();
  return singleton;
}

/** Test seam; production code never changes the provider after process start. */
export function setAIProviderForTests(provider: AIProvider | null): void {
  singleton = provider;
}
