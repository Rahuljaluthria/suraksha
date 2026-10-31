import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import {
  createAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateFamilyId,
} from "../../utils/tokens.js";
import { createAuditLog } from "../../utils/audit.js";
import type { RegisterInput, LoginInput } from "./auth.schemas.js";

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  roles: string[];
  permissions: string[];
  lastLoginAt?: Date | null;
  createdAt: Date;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class AuthService {
  /**
   * Registers a new user. Always assigns the EMPLOYEE role by default.
   */
  async register(
    input: RegisterInput,
    meta: RequestMetadata
  ): Promise<{ user: SafeUser }> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existing) {
      throw new AuthError("An account with this email already exists", 409, "EMAIL_EXISTS");
    }

    // Role check: default to EMPLOYEE
    const employeeRole = await prisma.role.findUnique({
      where: { code: "EMPLOYEE" },
      include: { permissions: { include: { permission: true } } },
    });

    if (!employeeRole) {
      throw new AuthError(
        "Default EMPLOYEE role not found in database. Please run database seeding first.",
        500,
        "ROLE_NOT_FOUND"
      );
    }

    const passwordHash = await hashPassword(input.password);
    const initialStatus = env.REQUIRE_EMAIL_VERIFICATION ? "PENDING_VERIFICATION" : "ACTIVE";

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          status: initialStatus,
          emailVerifiedAt: env.REQUIRE_EMAIL_VERIFICATION ? null : new Date(),
          roles: {
            create: {
              roleId: employeeRole.id,
            },
          },
        },
      });

      await createAuditLog(
        {
          actorId: createdUser.id,
          action: "AUTH_REGISTER",
          entityType: "User",
          entityId: createdUser.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          metadata: { role: "EMPLOYEE", status: initialStatus },
        },
        tx
      );

      return createdUser;
    });

    const permissions = employeeRole.permissions.map((rp) => rp.permission.key);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        roles: ["EMPLOYEE"],
        permissions,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Authenticates user and issues access token + refresh session.
   */
  async login(
    input: LoginInput,
    meta: RequestMetadata
  ): Promise<{
    user: SafeUser;
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      await createAuditLog({
        action: "AUTH_LOGIN_FAILED",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { email: input.email, reason: "USER_NOT_FOUND" },
      });
      throw new AuthError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // 1. Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / (60 * 1000)
      );
      throw new AuthError(
        `Account is temporarily locked due to multiple failed login attempts. Try again in ${remainingMinutes} minute(s).`,
        423,
        "ACCOUNT_LOCKED"
      );
    }

    // 2. Check account status
    if (user.status === "DISABLED") {
      throw new AuthError("Account has been disabled. Please contact an administrator.", 403, "ACCOUNT_DISABLED");
    }

    if (user.status === "SUSPENDED") {
      throw new AuthError("Account is suspended. Please contact an administrator.", 403, "ACCOUNT_SUSPENDED");
    }

    if (user.status === "PENDING_VERIFICATION") {
      throw new AuthError("Account email verification is pending.", 403, "ACCOUNT_PENDING_VERIFICATION");
    }

    // 3. Verify password
    const isPasswordValid = await verifyPassword(user.passwordHash, input.password);

    if (!isPasswordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const willLock = newAttempts >= env.MAX_FAILED_LOGIN_ATTEMPTS;
      const lockedUntil = willLock
        ? new Date(Date.now() + env.ACCOUNT_LOCK_MINUTES * 60 * 1000)
        : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil,
        },
      });

      await createAuditLog({
        actorId: user.id,
        action: willLock ? "AUTH_ACCOUNT_LOCKED" : "AUTH_LOGIN_FAILED",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { attempts: newAttempts, locked: willLock },
      });

      if (willLock) {
        throw new AuthError(
          `Account locked due to ${env.MAX_FAILED_LOGIN_ATTEMPTS} failed attempts. Try again in ${env.ACCOUNT_LOCK_MINUTES} minutes.`,
          423,
          "ACCOUNT_LOCKED"
        );
      }

      throw new AuthError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // 4. Successful login: Generate tokens & record session
    const roles = user.roles.map((ur) => ur.role.code);
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.key)
        )
      )
    );

    const accessToken = await createAccessToken({
      userId: user.id,
      email: user.email,
      roles,
      permissions,
    });

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const familyId = generateFamilyId();
    const expiresAt = new Date(
      Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.$transaction(async (tx) => {
      // Reset failed attempts & update lastLoginAt
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      // Create refresh session
      await tx.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash,
          familyId,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          expiresAt,
        },
      });

      // Audit log
      await createAuditLog(
        {
          actorId: user.id,
          action: "AUTH_LOGIN_SUCCESS",
          entityType: "User",
          entityId: user.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
        tx
      );
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        roles,
        permissions,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Rotates refresh token with reuse detection.
   */
  async refresh(
    rawRefreshToken: string,
    meta: RequestMetadata
  ): Promise<{
    user: SafeUser;
    accessToken: string;
    refreshToken: string;
  }> {
    if (!rawRefreshToken) {
      throw new AuthError("Refresh token is required", 401, "MISSING_TOKEN");
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);

    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new AuthError("Invalid or expired session", 401, "INVALID_TOKEN");
    }

    // 1. REUSE DETECTION: If token was already revoked, someone is replaying an old token!
    if (session.revokedAt !== null) {
      // Invalidate the ENTIRE token family immediately
      await prisma.$transaction(async (tx) => {
        await tx.refreshSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: {
            revokedAt: new Date(),
            revokeReason: "REUSE_DETECTED",
          },
        });

        await createAuditLog(
          {
            actorId: session.userId,
            action: "AUTH_REFRESH_TOKEN_REUSE_DETECTED",
            entityType: "RefreshSession",
            entityId: session.id,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            metadata: {
              familyId: session.familyId,
              originalRevokeReason: session.revokeReason,
            },
          },
          tx
        );
      });

      throw new AuthError(
        "Security alert: Refresh token reuse detected. All active sessions have been invalidated. Please log in again.",
        401,
        "TOKEN_REUSE_DETECTED"
      );
    }

    // 2. Check token expiration
    if (session.expiresAt < new Date()) {
      await prisma.refreshSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          revokeReason: "EXPIRED",
        },
      });

      throw new AuthError("Refresh token has expired. Please log in again.", 401, "TOKEN_EXPIRED");
    }

    // 3. Check user status
    const user = session.user;
    if (
      user.status === "DISABLED" ||
      user.status === "SUSPENDED" ||
      (user.lockedUntil && user.lockedUntil > new Date())
    ) {
      await prisma.refreshSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          revokeReason: "ACCOUNT_INACTIVE",
        },
      });

      throw new AuthError("Account is inactive or locked.", 403, "ACCOUNT_INACTIVE");
    }

    // 4. Token rotation: Revoke old session and issue new session in the same family
    const newRawRefreshToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.$transaction(async (tx) => {
      // Mark current session as rotated
      await tx.refreshSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
          revokeReason: "ROTATED",
        },
      });

      // Create new session in the same family
      await tx.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash: newTokenHash,
          familyId: session.familyId,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          expiresAt: newExpiresAt,
        },
      });

      // Audit log
      await createAuditLog(
        {
          actorId: user.id,
          action: "AUTH_REFRESH_SUCCESS",
          entityType: "RefreshSession",
          entityId: session.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          metadata: { familyId: session.familyId },
        },
        tx
      );
    });

    const roles = user.roles.map((ur) => ur.role.code);
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.key)
        )
      )
    );

    const accessToken = await createAccessToken({
      userId: user.id,
      email: user.email,
      roles,
      permissions,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        roles,
        permissions,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Logs out the user by revoking the refresh session.
   */
  async logout(rawRefreshToken?: string, meta?: RequestMetadata): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = hashRefreshToken(rawRefreshToken);

    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (session && !session.revokedAt) {
      await prisma.$transaction(async (tx) => {
        await tx.refreshSession.update({
          where: { id: session.id },
          data: {
            revokedAt: new Date(),
            revokeReason: "LOGOUT",
          },
        });

        await createAuditLog(
          {
            actorId: session.userId,
            action: "AUTH_LOGOUT",
            entityType: "RefreshSession",
            entityId: session.id,
            ipAddress: meta?.ipAddress,
            userAgent: meta?.userAgent,
          },
          tx
        );
      });
    }
  }

  /**
   * Retrieves profile data for the authenticated user.
   */
  async getMe(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AuthError("User not found", 404, "USER_NOT_FOUND");
    }

    const roles = user.roles.map((ur) => ur.role.code);
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.key)
        )
      )
    );

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roles,
      permissions,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}

export const authService = new AuthService();

