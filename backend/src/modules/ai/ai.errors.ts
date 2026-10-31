/**
 * Typed AI errors. `message` is safe to show to end users; provider details
 * (status codes, upstream bodies) are kept in dedicated fields for audit
 * metadata only and are never returned to the client.
 */
export abstract class AiError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
}

export class AiNotConfiguredError extends AiError {
  readonly code = "AI_NOT_CONFIGURED";
  readonly httpStatus = 503;
  constructor(message = "AI assistance is not available on this deployment") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export class AiTimeoutError extends AiError {
  readonly code = "AI_TIMEOUT";
  readonly httpStatus = 504;
  constructor(message = "The AI service took too long to respond. Please try again.") {
    super(message);
    this.name = "AiTimeoutError";
  }
}

/** Provider-side 429, or the local concurrency cap being reached. */
export class AiRateLimitedError extends AiError {
  readonly httpStatus = 429;
  constructor(
    readonly code: "AI_PROVIDER_RATE_LIMITED" | "AI_BUSY" = "AI_PROVIDER_RATE_LIMITED",
    readonly retryAfterSeconds?: number,
    message = "The AI service is busy. Please wait a moment and try again."
  ) {
    super(message);
    this.name = "AiRateLimitedError";
  }
}

export class AiUpstreamError extends AiError {
  readonly code = "AI_UPSTREAM_ERROR";
  readonly httpStatus = 502;
  constructor(
    readonly upstreamStatus?: number,
    message = "The AI service is currently unavailable. Please try again later."
  ) {
    super(message);
    this.name = "AiUpstreamError";
  }
}

export class AiInvalidResponseError extends AiError {
  readonly code = "AI_INVALID_RESPONSE";
  readonly httpStatus = 502;
  constructor(
    readonly reason: "blank" | "truncated" | "not_json" | "schema_mismatch",
    message = "The AI service returned a response that could not be used. Please try again."
  ) {
    super(message);
    this.name = "AiInvalidResponseError";
  }
}
