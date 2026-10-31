import crypto from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  tokenType: "access";
}

const secretKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

/**
 * Signs and generates a short-lived JWT access token using jose.
 */
export async function createAccessToken(params: {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
}): Promise<string> {
  return new SignJWT({
    email: params.email,
    roles: params.roles,
    permissions: params.permissions,
    tokenType: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRY)
    .sign(secretKey);
}

/**
 * Verifies a JWT access token using jose.
 * Throws an error if invalid or expired.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    algorithms: ["HS256"],
  });

  if (payload.tokenType !== "access" || !payload.sub) {
    throw new Error("Invalid token type or missing subject");
  }

  return payload as AccessTokenPayload;
}

/**
 * Generates an 80-character high-entropy cryptographic random refresh token.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

/**
 * Hashes a refresh token using SHA-256 for secure database storage and lookup.
 */
export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generates a unique family ID for refresh token rotation tracking.
 */
export function generateFamilyId(): string {
  return crypto.randomUUID();
}

