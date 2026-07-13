export type AITask = "intent_classifier" | "conversation" | "summary";

export interface AIModelRequest {
  task: AITask;
  model: string;
  prompt: string;
  systemInstruction?: string;
  temperature: number;
  maxOutputTokens: number;
  topP?: number;
  topK?: number;
  reasoningBudget?: number;
  timeoutMs: number;
  responseFormat: "json" | "text";
}

export interface AIUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
}

export interface AIProviderMetadata {
  provider: string;
  model: string;
  task: AITask;
  finishReason: string | null;
  latencyMs: number;
  usage: AIUsage;
  effectiveSettings: {
    temperature: number;
    maxOutputTokens: number;
    reasoningBudget: number | null;
    streaming: false;
  };
}

export interface AIModelResult {
  text: string;
  metadata: AIProviderMetadata;
}

export interface AIProvider {
  readonly id: string;
  generate(request: AIModelRequest): Promise<AIModelResult>;
}

export type AIProviderErrorKind =
  | "timeout"
  | "rate_limit"
  | "unavailable"
  | "authentication"
  | "invalid_request"
  | "network"
  | "unknown";

export class AIProviderError extends Error {
  readonly kind: AIProviderErrorKind;
  readonly retryable: boolean;
  readonly status: number | null;
  override readonly cause: unknown;

  constructor(params: {
    message: string;
    kind: AIProviderErrorKind;
    retryable: boolean;
    status?: number | null;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "AIProviderError";
    this.kind = params.kind;
    this.retryable = params.retryable;
    this.status = params.status ?? null;
    this.cause = params.cause;
  }
}

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value =
    "status" in error
      ? (error as { status?: unknown }).status
      : "statusCode" in error
        ? (error as { statusCode?: unknown }).statusCode
        : null;
  return typeof value === "number" ? value : null;
}

export function normalizeAIProviderError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;

  const status = readStatus(error);
  const message = error instanceof Error ? error.message : "Unknown AI provider error";
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new AIProviderError({
      message,
      kind: "timeout",
      retryable: true,
      status,
      cause: error,
    });
  }
  if (status === 429) {
    return new AIProviderError({
      message,
      kind: "rate_limit",
      retryable: true,
      status,
      cause: error,
    });
  }
  if (status !== null && status >= 500) {
    return new AIProviderError({
      message,
      kind: "unavailable",
      retryable: true,
      status,
      cause: error,
    });
  }
  if (status === 401 || status === 403) {
    return new AIProviderError({
      message,
      kind: "authentication",
      retryable: false,
      status,
      cause: error,
    });
  }
  if (status !== null && status >= 400) {
    return new AIProviderError({
      message,
      kind: "invalid_request",
      retryable: false,
      status,
      cause: error,
    });
  }
  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("socket")
  ) {
    return new AIProviderError({
      message,
      kind: "network",
      retryable: true,
      status,
      cause: error,
    });
  }

  return new AIProviderError({
    message,
    kind: "unknown",
    retryable: false,
    status,
    cause: error,
  });
}

export function isRetryableAIProviderError(error: unknown): boolean {
  return normalizeAIProviderError(error).retryable;
}
