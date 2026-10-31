import type { Request, Response } from "express";
import { authService, AuthError } from "./auth.service.js";
import { env } from "../../config/env.js";

const getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: (env.NODE_ENV === "production" ? "strict" : "lax") as "strict" | "lax",
  maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  path: "/api/auth",
});

const getRequestMetadata = (req: Request) => ({
  ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || req.ip,
  userAgent: req.headers["user-agent"],
});

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const meta = getRequestMetadata(req);
      const result = await authService.register(req.body, meta);

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: result,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
        return;
      }

      console.error("[AuthController] Register error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during registration",
      });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const meta = getRequestMetadata(req);
      const { user, accessToken, refreshToken } = await authService.login(req.body, meta);

      // Store refresh token in secure HttpOnly cookie
      res.cookie(env.REFRESH_TOKEN_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

      res.status(200).json({
        success: true,
        message: "Logged in successfully",
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
        return;
      }

      console.error("[AuthController] Login error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during login",
      });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const rawRefreshToken =
      req.cookies?.[env.REFRESH_TOKEN_COOKIE_NAME] || req.body?.refreshToken;

    try {
      const meta = getRequestMetadata(req);
      const { user, accessToken, refreshToken } = await authService.refresh(
        rawRefreshToken,
        meta
      );

      // Set the newly rotated refresh token cookie
      res.cookie(env.REFRESH_TOKEN_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      // Clear cookie on invalid/reused/expired token
      res.clearCookie(env.REFRESH_TOKEN_COOKIE_NAME, { path: "/api/auth" });

      if (error instanceof AuthError) {
        res.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
        return;
      }

      console.error("[AuthController] Refresh error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during token refresh",
      });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const rawRefreshToken =
        req.cookies?.[env.REFRESH_TOKEN_COOKIE_NAME] || req.body?.refreshToken;
      const meta = getRequestMetadata(req);

      await authService.logout(rawRefreshToken, meta);
      res.clearCookie(env.REFRESH_TOKEN_COOKIE_NAME, { path: "/api/auth" });

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      res.clearCookie(env.REFRESH_TOKEN_COOKIE_NAME, { path: "/api/auth" });
      console.error("[AuthController] Logout error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during logout",
      });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required",
        });
        return;
      }

      const user = await authService.getMe(req.user.id);

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
        return;
      }

      console.error("[AuthController] Me error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error retrieving user profile",
      });
    }
  }
}

export const authController = new AuthController();

