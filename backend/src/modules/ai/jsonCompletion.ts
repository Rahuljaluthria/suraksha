import type { ZodType, z } from "zod";
import { env } from "../../config/env.js";
import { AiInvalidResponseError, AiRateLimitedError } from "./ai.errors.js";
import type { LlmMessage, LlmProvider, LlmUsage } from "./providers/llmProvider.js";

export interface StructuredCallMeta {
  provider: string;
  model: string;
  attempts: number;
  latencyMs: number;
  usage: LlmUsage;
}

export interface StructuredCallOptions<S extends ZodType> {
  provider: LlmProvider;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
}

let activeCalls = 0;

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

function addUsage(total: LlmUsage, next: LlmUsage): LlmUsage {
  const sum = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  return {
    promptTokens: sum(total.promptTokens, next.promptTokens),
    completionTokens: sum(total.completionTokens, next.completionTokens),
    totalTokens: sum(total.totalTokens, next.totalTokens),
  };
}

/**
 * Calls the model, parses JSON and validates it against a Zod schema.
 * On unusable output it makes exactly one repair attempt (telling the model
 * which fields were wrong, without echoing values) before failing with
 * AiInvalidResponseError. Also enforces a local cap on concurrent upstream calls.
 */
export async function generateStructured<S extends ZodType>(
  options: StructuredCallOptions<S>
): Promise<{ data: z.infer<S>; meta: StructuredCallMeta }> {
  if (activeCalls >= env.AI_MAX_CONCURRENCY) {
    throw new AiRateLimitedError("AI_BUSY", 5);
  }

  activeCalls++;
  try {
    const messages: LlmMessage[] = [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ];

    let usage: LlmUsage = {};
    let latencyMs = 0;
    let model = "";
    let lastReason: AiInvalidResponseError["reason"] = "not_json";

    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await options.provider.complete({
        messages,
        maxTokens: options.maxTokens,
      });
      usage = addUsage(usage, response.usage);
      latencyMs += response.latencyMs;
      model = response.model;

      let problem: string | null = null;

      if (response.finishReason === "length") {
        lastReason = "truncated";
        problem = "The previous response was cut off. Return a shorter, complete JSON object.";
      } else if (response.content.trim().length === 0) {
        lastReason = "blank";
        problem = "The previous response was empty. Return the JSON object.";
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(stripCodeFence(response.content));
        } catch {
          lastReason = "not_json";
          problem = "The previous response was not valid JSON. Return only a valid JSON object.";
        }

        if (problem === null) {
          const result = options.schema.safeParse(parsed);
          if (result.success) {
            return {
              data: result.data,
              meta: {
                provider: options.provider.name,
                model,
                attempts: attempt,
                latencyMs,
                usage,
              },
            };
          }
          lastReason = "schema_mismatch";
          const issues = result.error.issues
            .slice(0, 10)
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ");
          problem = `The previous JSON did not match the required schema (${issues}). Return corrected JSON only.`;
        }
      }

      messages.push(
        { role: "assistant", content: response.content.slice(0, 2000) },
        { role: "user", content: problem }
      );
    }

    throw new AiInvalidResponseError(lastReason);
  } finally {
    activeCalls--;
  }
}
