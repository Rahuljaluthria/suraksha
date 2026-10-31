export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  maxTokens: number;
  temperature?: number;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmResponse {
  content: string;
  model: string;
  usage: LlmUsage;
  finishReason?: string;
  latencyMs: number;
}

/**
 * The only surface the AI service depends on. DeepSeek is one implementation;
 * tests inject a fake. Implementations must throw the typed errors in
 * ai.errors.ts and must request JSON output from the model.
 */
export interface LlmProvider {
  readonly name: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}
