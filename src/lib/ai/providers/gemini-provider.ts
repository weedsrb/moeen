import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  AIProviderError,
  normalizeAIProviderError,
  type AIModelRequest,
  type AIModelResult,
  type AIProvider,
} from "../provider";

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
}

export class GeminiAIProvider implements AIProvider {
  readonly id = "gemini";

  async generate(request: AIModelRequest): Promise<AIModelResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIProviderError({
        message: "GEMINI_API_KEY is not configured",
        kind: "authentication",
        retryable: false,
      });
    }

    const generationConfig = {
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      topP: request.topP,
      topK: request.topK,
      responseMimeType:
        request.responseFormat === "json" ? "application/json" : "text/plain",
      // Supported by Gemini 2.5 even though the legacy SDK types lag behind.
      thinkingConfig:
        request.reasoningBudget === undefined
          ? undefined
          : { thinkingBudget: request.reasoningBudget },
    };

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: request.model,
      systemInstruction: request.systemInstruction,
      generationConfig,
    });

    const startedAt = Date.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new AIProviderError({
                message: `Gemini ${request.task} timed out after ${request.timeoutMs}ms`,
                kind: "timeout",
                retryable: true,
              })
            ),
          request.timeoutMs
        );
      });
      const result = await Promise.race([
        model.generateContent(request.prompt),
        timeoutPromise,
      ]);
      const response = result.response;
      const candidate = response.candidates?.[0];
      const usage = response.usageMetadata as GeminiUsageMetadata | undefined;

      return {
        text: response.text(),
        metadata: {
          provider: this.id,
          model: request.model,
          task: request.task,
          finishReason: candidate?.finishReason ?? null,
          latencyMs: Date.now() - startedAt,
          usage: {
            inputTokens: usage?.promptTokenCount ?? null,
            outputTokens: usage?.candidatesTokenCount ?? null,
            totalTokens: usage?.totalTokenCount ?? null,
            cachedInputTokens: usage?.cachedContentTokenCount ?? null,
          },
          effectiveSettings: {
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            reasoningBudget: request.reasoningBudget ?? null,
            streaming: false,
          },
        },
      };
    } catch (error) {
      throw normalizeAIProviderError(error);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
