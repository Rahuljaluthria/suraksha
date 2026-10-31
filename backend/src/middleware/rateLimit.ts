import rateLimit from "express-rate-limit";

/**
 * Strict rate limiter for sensitive authentication endpoints (e.g. login, register).
 * Limits to 10 requests per 15-minute window per IP to prevent brute-force attacks.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again after 15 minutes.",
  },
});

/**
 * Moderate rate limiter for token refresh requests.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many refresh attempts. Please try again later.",
  },
});

/**
 * Rate limiter for incident creation and mutation endpoints.
 */
export const incidentMutationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many incident operations. Please slow down.",
  },
});


