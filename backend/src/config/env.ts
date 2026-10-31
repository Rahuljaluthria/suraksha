import "dotenv/config";

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  DATABASE_URL: process.env.DATABASE_URL || "",

  // JWT configuration
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET || "suraksha-super-secret-access-token-key-change-in-production-min32chars",
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || "15m",
  JWT_ISSUER: process.env.JWT_ISSUER || "suraksha-api",
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || "suraksha-client",

  // Refresh token configuration
  REFRESH_TOKEN_EXPIRY_DAYS: Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7,
  REFRESH_TOKEN_COOKIE_NAME: process.env.REFRESH_TOKEN_COOKIE_NAME || "suraksha_refresh_token",

  // Rate limiting / Account lock
  MAX_FAILED_LOGIN_ATTEMPTS: Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS) || 5,
  ACCOUNT_LOCK_MINUTES: Number(process.env.ACCOUNT_LOCK_MINUTES) || 15,

  // Whether public registration requires email verification before login
  REQUIRE_EMAIL_VERIFICATION: process.env.REQUIRE_EMAIL_VERIFICATION === "true",

  // AI assistance (DeepSeek). The key is optional: without it the AI endpoints
  // answer 503 AI_NOT_CONFIGURED and the rest of the application is unaffected.
  AI_ENABLED: process.env.AI_ENABLED !== "false",
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
  DEEPSEEK_BASE_URL: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || "deepseek-flash",
  AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS) || 30_000,
  AI_MAX_CONCURRENCY: Number(process.env.AI_MAX_CONCURRENCY) || 4,
  AI_RATE_LIMIT_MAX: Number(process.env.AI_RATE_LIMIT_MAX) || 15,
  AI_RATE_LIMIT_WINDOW_MINUTES: Number(process.env.AI_RATE_LIMIT_WINDOW_MINUTES) || 10,
  // "none" keeps IP addresses (useful indicators), "private" masks RFC1918 ranges, "all" masks every IPv4
  AI_MASK_IPS: (["none", "private", "all"].includes(process.env.AI_MASK_IPS ?? "")
    ? process.env.AI_MASK_IPS
    : "none") as "none" | "private" | "all",
};
