import { env } from "../../../config/env.js";
import {
  AiNotConfiguredError,
  AiRateLimitedError,
  AiTimeoutError,
  AiUpstreamError,
} from "../ai.errors.js";
import type { LlmProvider, LlmRequest, LlmResponse } from "./llmProvider.js";

export interface DeepSeekClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Extra attempts for 500/503/network failures. 429 is never blindly retried. */
  maxRetries?: number;
  retryDelayMs?: number;
}

interface ChatCompletionBody {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Minimal DeepSeek chat-completions client (OpenAI-compatible API) built on
 * Node's fetch. The API key only ever travels in the Authorization header and
 * is never included in errors or logs.
 */
export class DeepSeekClient implements LlmProvider {
  readonly name = "deepseek";

  constructor(private readonly options: DeepSeekClientOptions) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const maxRetries = this.options.maxRetries ?? 1;
    const retryDelayMs = this.options.retryDelayMs ?? 500;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.send(request);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof AiUpstreamError &&
          (error.upstreamStatus === undefined ||
            error.upstreamStatus === 500 ||
            error.upstreamStatus === 503);
        if (!retryable || attempt === maxRetries) throw error;
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
    throw lastError;
  }

  private async send(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature ?? 0.1,
          response_format: { type: "json_object" },
          stream: false,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "TimeoutError" || name === "AbortError") throw new AiTimeoutError();
      throw new AiUpstreamError(undefined);
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new AiRateLimitedError(
        "AI_PROVIDER_RATE_LIMITED",
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }

    if (!response.ok) {
      // 400/401/402/422 are our configuration or request problems; 500/503 are transient.
      // The upstream body is deliberately discarded.
      throw new AiUpstreamError(response.status);
    }

    let body: ChatCompletionBody;
    try {
      body = (await response.json()) as ChatCompletionBody;
    } catch {
      throw new AiUpstreamError(response.status);
    }

    const choice = body.choices?.[0];
    return {
      content: choice?.message?.content ?? "",
      model: body.model ?? this.options.model,
      finishReason: choice?.finish_reason,
      usage: {
        promptTokens: body.usage?.prompt_tokens,
        completionTokens: body.usage?.completion_tokens,
        totalTokens: body.usage?.total_tokens,
      },
      latencyMs: Date.now() - startedAt,
    };
  }
}

let overrideProvider: LlmProvider | null = null;

/** Test hook: pass null to restore the real provider. */
export function setLlmProviderForTests(provider: LlmProvider | null): void {
  overrideProvider = provider;
}

/**
 * The API key travels in a header, so the endpoint must use TLS. Plain http is only
 * accepted for loopback addresses (local mocks and tests).
 */
export function isSafeBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

let warnedUnsafeBaseUrl = false;

export function isAiConfigured(): boolean {
  if (overrideProvider !== null) return true;
  if (!env.AI_ENABLED || env.DEEPSEEK_API_KEY.length === 0) return false;
  if (!isSafeBaseUrl(env.DEEPSEEK_BASE_URL)) {
    if (!warnedUnsafeBaseUrl) {
      warnedUnsafeBaseUrl = true;
      console.warn("[AI] DEEPSEEK_BASE_URL must use https (http is allowed only for localhost). AI is disabled.");
    }
    return false;
  }
  return true;
}

export function getLlmProvider(): LlmProvider {
  if (overrideProvider) return overrideProvider;
  if (!isAiConfigured()) throw new AiNotConfiguredError();

  return new DeepSeekClient({
    apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: env.DEEPSEEK_BASE_URL,
    model: env.DEEPSEEK_MODEL,
    timeoutMs: env.AI_TIMEOUT_MS,
  });
}
