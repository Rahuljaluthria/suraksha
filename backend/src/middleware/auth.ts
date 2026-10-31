import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../utils/tokens.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware that authenticates requests using the Authorization Bearer JWT.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      code: "MISSING_TOKEN",
      message: "Authentication token is missing",
    });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const payload: AccessTokenPayload = await verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
    };

    next();
  } catch (error: unknown) {
    const err = error as { name?: string; code?: string };
    const isExpired = err.name === "JWTExpired" || err.code === "ERR_JWT_EXPIRED";

    res.status(401).json({
      success: false,
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      message: isExpired ? "Access token has expired" : "Invalid or malformed access token",
    });
  }
}

