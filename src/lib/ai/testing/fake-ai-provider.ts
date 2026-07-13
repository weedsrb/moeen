import type {
  AIModelRequest,
  AIModelResult,
  AIProvider,
} from "../provider";

export class FakeAIProvider implements AIProvider {
  readonly id = "fake";
  readonly requests: AIModelRequest[] = [];
  private readonly results: Array<AIModelResult | Error> = [];

  enqueue(result: AIModelResult | Error): void {
    this.results.push(result);
  }

  async generate(request: AIModelRequest): Promise<AIModelResult> {
    this.requests.push(request);
    const next = this.results.shift();
    if (!next) throw new Error("FakeAIProvider has no queued result");
    if (next instanceof Error) throw next;
    return next;
  }
}
