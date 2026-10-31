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

  // Refresh token configuration
  REFRESH_TOKEN_EXPIRY_DAYS: Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7,
  REFRESH_TOKEN_COOKIE_NAME: process.env.REFRESH_TOKEN_COOKIE_NAME || "suraksha_refresh_token",

  // Rate limiting / Account lock
  MAX_FAILED_LOGIN_ATTEMPTS: Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS) || 5,
  ACCOUNT_LOCK_MINUTES: Number(process.env.ACCOUNT_LOCK_MINUTES) || 15,

  // Whether public registration requires email verification before login
  REQUIRE_EMAIL_VERIFICATION: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
};

