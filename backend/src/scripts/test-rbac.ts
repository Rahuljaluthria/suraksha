import { prisma } from "../config/prisma.js";
import { redis } from "../config/redis.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole, requirePermission } from "../middleware/rbac.js";
import { authorizeResourceAccess } from "../utils/resourceAuth.js";
import { createAccessToken, verifyAccessToken } from "../utils/tokens.js";
import { invalidateUserRbacCache } from "../utils/permissionCache.js";
import { hashPassword } from "../utils/password.js";
import { SignJWT } from "jose";
import { env } from "../config/env.js";
import type { Request, Response, NextFunction } from "express";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

interface MockRes {
  statusCode: number;
  body: any;
  status: (code: number) => MockRes;
  json: (data: any) => MockRes;
}

function createMockReqRes(options: {
  authHeader?: string;
  originalUrl?: string;
  method?: string;
}) {
  const req = {
    headers: {
      authorization: options.authHeader,
      "user-agent": "SurakshaRBACTest/1.0",
    },
    ip: "127.0.0.1",
    originalUrl: options.originalUrl || "/api/test",
    method: options.method || "GET",
  } as unknown as Request;

  const res: MockRes = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };

  return { req, res: res as unknown as Response, mockRes: res };
}

async function runMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
  req: Request,
  res: Response
): Promise<boolean> {
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return nextCalled;
}

async function runTests(): Promise<void> {
  console.log("========================================");
  console.log("    SURAKSHA RBAC & AUTH MIDDLEWARE     ");
  console.log("========================================");

  const timestamp = Date.now();
  const passwordHash = await hashPassword("TestPassword123!");

  // Look up roles
  const employeeRole = await prisma.role.findUniqueOrThrow({ where: { code: "EMPLOYEE" } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  const auditorRole = await prisma.role.findUniqueOrThrow({ where: { code: "AUDITOR" } });

  // Create Test User A (Employee)
  const userA = await prisma.user.create({
    data: {
      email: `emp_a_${timestamp}@suraksha.local`,
      firstName: "Employee",
      lastName: "Alpha",
      passwordHash,
      status: "ACTIVE",
      roles: { create: { roleId: employeeRole.id } },
    },
  });

  // Create Test User B (Employee)
  const userB = await prisma.user.create({
    data: {
      email: `emp_b_${timestamp}@suraksha.local`,
      firstName: "Employee",
      lastName: "Beta",
      passwordHash,
      status: "ACTIVE",
      roles: { create: { roleId: employeeRole.id } },
    },
  });

  // Create Test User C (Admin)
  const userAdmin = await prisma.user.create({
    data: {
      email: `admin_${timestamp}@suraksha.local`,
      firstName: "Admin",
      lastName: "User",
      passwordHash,
      status: "ACTIVE",
      roles: { create: { roleId: adminRole.id } },
    },
  });

  // Create Test User D (Auditor)
  const userAuditor = await prisma.user.create({
    data: {
      email: `auditor_${timestamp}@suraksha.local`,
      firstName: "Auditor",
      lastName: "User",
      passwordHash,
      status: "ACTIVE",
      roles: { create: { roleId: auditorRole.id } },
    },
  });

  try {
    // ----------------------------------------------------
    // TEST 1: Missing Token
    // ----------------------------------------------------
    console.log("\n1. Testing Missing Token...");
    {
      const { req, res, mockRes } = createMockReqRes({});
      const nextCalled = await runMiddleware(requireAuth, req, res);

      assert(!nextCalled, "requireAuth blocks execution when token is missing");
      assert(mockRes.statusCode === 401, "Missing token returns 401");
      assert(mockRes.body?.code === "MISSING_TOKEN", "Error code is MISSING_TOKEN");
    }

    // ----------------------------------------------------
    // TEST 2: Invalid / Forged Token
    // ----------------------------------------------------
    console.log("\n2. Testing Invalid / Forged Token...");
    {
      const { req, res, mockRes } = createMockReqRes({
        authHeader: "Bearer invalid.jwt.token.here",
      });
      const nextCalled = await runMiddleware(requireAuth, req, res);

      assert(!nextCalled, "requireAuth blocks execution on invalid token");
      assert(mockRes.statusCode === 401, "Invalid token returns 401");
      assert(mockRes.body?.code === "INVALID_TOKEN", "Error code is INVALID_TOKEN");
    }

    // ----------------------------------------------------
    // TEST 3: Expired Token
    // ----------------------------------------------------
    console.log("\n3. Testing Expired Token...");
    {
      const secretKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
      const expiredToken = await new SignJWT({
        email: userA.email,
        roles: ["EMPLOYEE"],
        permissions: [],
        tokenType: "access",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userA.id)
        .setIssuer(env.JWT_ISSUER)
        .setAudience(env.JWT_AUDIENCE)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // Expired 30 min ago
        .sign(secretKey);

      const { req, res, mockRes } = createMockReqRes({
        authHeader: `Bearer ${expiredToken}`,
      });
      const nextCalled = await runMiddleware(requireAuth, req, res);

      assert(!nextCalled, "requireAuth blocks execution on expired token");
      assert(mockRes.statusCode === 401, "Expired token returns 401");
      assert(mockRes.body?.code === "TOKEN_EXPIRED", "Error code is TOKEN_EXPIRED");
    }

    // ----------------------------------------------------
    // TEST 4: Valid Token & User Context Attachment
    // ----------------------------------------------------
    console.log("\n4. Testing Valid Token...");
    const tokenA = await createAccessToken({
      userId: userA.id,
      email: userA.email,
      roles: ["EMPLOYEE"],
      permissions: ["incident:create"],
    });

    {
      const { req, res, mockRes } = createMockReqRes({
        authHeader: `Bearer ${tokenA}`,
      });
      const nextCalled = await runMiddleware(requireAuth, req, res);

      assert(nextCalled, "requireAuth calls next() for valid token");
      assert(mockRes.statusCode === 200, "Status remains 200");
      assert(req.user?.id === userA.id, "req.user.id attached correctly");
      assert(req.user?.hasRole("EMPLOYEE") === true, "req.user.hasRole('EMPLOYEE') is true");
      assert(
        req.user?.hasPermission("incident:create") === true,
        "req.user.hasPermission('incident:create') is true"
      );
    }

    // ----------------------------------------------------
    // TEST 5: Suspended User Blocked
    // ----------------------------------------------------
    console.log("\n5. Testing Suspended User Blocked...");
    await prisma.user.update({
      where: { id: userA.id },
      data: { status: "SUSPENDED" },
    });
    await invalidateUserRbacCache(userA.id);

    {
      const { req, res, mockRes } = createMockReqRes({
        authHeader: `Bearer ${tokenA}`,
      });
      const nextCalled = await runMiddleware(requireAuth, req, res);

      assert(!nextCalled, "requireAuth blocks suspended user");
      assert(mockRes.statusCode === 403, "Suspended user receives 403");
      assert(mockRes.body?.code === "ACCOUNT_SUSPENDED", "Error code is ACCOUNT_SUSPENDED");
    }

    // ----------------------------------------------------
    // TEST 6: Disabled User Blocked
    // ----------------------------------------------------
    console.log("\n6. Testing Disabled User Blocked...");
    await prisma.user.update({
      where: { id: userA.id },
      data: { status: "DISABLED" },
    });
    await invalidateUserRbacCache(userA.id);

    {
      const { req, res, mockRes } = createMockReqRes({
        authHeader: `Bearer ${tokenA}`,
      });
      const nextCalled = await runMiddleware(requireAuth, req, res);

      assert(!nextCalled, "requireAuth blocks disabled user");
      assert(mockRes.statusCode === 403, "Disabled user receives 403");
      assert(mockRes.body?.code === "ACCOUNT_DISABLED", "Error code is ACCOUNT_DISABLED");
    }

    // Restore userA to ACTIVE
    await prisma.user.update({
      where: { id: userA.id },
      data: { status: "ACTIVE" },
    });
    await invalidateUserRbacCache(userA.id);

    // ----------------------------------------------------
    // TEST 7: Role Authorization Success & Failure
    // ----------------------------------------------------
    console.log("\n7. Testing Role Authorization (requireRole)...");
    const tokenAdmin = await createAccessToken({
      userId: userAdmin.id,
      email: userAdmin.email,
      roles: ["ADMIN"],
      permissions: ["user:read", "user:create"],
    });

    // 7a. Admin accessing ADMIN route -> PASS
    {
      const { req, res } = createMockReqRes({ authHeader: `Bearer ${tokenAdmin}` });
      await runMiddleware(requireAuth, req, res);

      const adminGuard = requireRole("ADMIN");
      const passedGuard = await runMiddleware(adminGuard, req, res);
      assert(passedGuard, "Admin user passes requireRole('ADMIN')");
    }

    // 7b. Employee accessing ADMIN route -> FAIL (403)
    {
      const { req, res, mockRes } = createMockReqRes({
        authHeader: `Bearer ${tokenA}`,
        originalUrl: "/api/admin/users",
        method: "GET",
      });
      await runMiddleware(requireAuth, req, res);

      const adminGuard = requireRole("ADMIN");
      const passedGuard = await runMiddleware(adminGuard, req, res);

      assert(!passedGuard, "Employee user blocked by requireRole('ADMIN')");
      assert(mockRes.statusCode === 403, "Blocked user receives 403 Forbidden");
      assert(mockRes.body?.code === "FORBIDDEN_ROLE", "Error code is FORBIDDEN_ROLE");

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: "AUTHZ_FORBIDDEN_ROLE",
          actorId: userA.id,
        },
      });
      assert(Boolean(audit), "AUTHZ_FORBIDDEN_ROLE recorded in AuditLog");
    }

    // ----------------------------------------------------
    // TEST 8: Permission Authorization Success & Failure
    // ----------------------------------------------------
    console.log("\n8. Testing Permission Authorization (requirePermission)...");

    // 8a. Employee with incident:create -> PASS
    {
      const { req, res } = createMockReqRes({ authHeader: `Bearer ${tokenA}` });
      await runMiddleware(requireAuth, req, res);

      const permGuard = requirePermission("incident:create");
      const passedGuard = await runMiddleware(permGuard, req, res);
      assert(passedGuard, "User with incident:create passes requirePermission('incident:create')");
    }

    // 8b. Employee lacking user:delete or user:disable -> FAIL (403)
    {
      const { req, res, mockRes } = createMockReqRes({
        authHeader: `Bearer ${tokenA}`,
        originalUrl: "/api/users/123/disable",
        method: "POST",
      });
      await runMiddleware(requireAuth, req, res);

      const permGuard = requirePermission("user:disable");
      const passedGuard = await runMiddleware(permGuard, req, res);

      assert(!passedGuard, "Employee lacking user:disable is blocked");
      assert(mockRes.statusCode === 403, "Receives 403 Forbidden");
      assert(mockRes.body?.code === "FORBIDDEN_PERMISSION", "Error code is FORBIDDEN_PERMISSION");

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: "AUTHZ_FORBIDDEN_PERMISSION",
          actorId: userA.id,
        },
      });
      assert(Boolean(audit), "AUTHZ_FORBIDDEN_PERMISSION recorded in AuditLog");
    }

    // ----------------------------------------------------
    // TEST 9: Resource Ownership & Assignment Checks
    // ----------------------------------------------------
    console.log("\n9. Testing Resource Ownership & Scopes...");
    {
      const { req: reqA, res: resA } = createMockReqRes({ authHeader: `Bearer ${tokenA}` });
      await runMiddleware(requireAuth, reqA, resA);
      const authenticatedUserA = reqA.user!;

      // 9a. Employee A accessing resource owned by Employee A -> ALLOWED
      const ownAccess = authorizeResourceAccess(authenticatedUserA, {
        actionPrefix: "incident:read",
        ownerId: userA.id,
        assigneeIds: [],
      });
      assert(ownAccess.allowed === true, "Employee accessing their own resource is ALLOWED");
      assert(ownAccess.matchedScope === "own", "Matched scope is 'own'");

      // 9b. Employee A accessing resource owned by Employee B -> DENIED
      const otherAccess = authorizeResourceAccess(authenticatedUserA, {
        actionPrefix: "incident:read",
        ownerId: userB.id,
        assigneeIds: [],
      });
      assert(otherAccess.allowed === false, "Employee accessing another employee's resource is DENIED");

      // 9c. User assigned to incident -> ALLOWED if user has :assigned permission
      const { req: reqAdmin, res: resAdmin } = createMockReqRes({ authHeader: `Bearer ${tokenAdmin}` });
      await runMiddleware(requireAuth, reqAdmin, resAdmin);

      // Admin has report:read
      const adminReportAccess = authorizeResourceAccess(reqAdmin.user!, {
        actionPrefix: "report:read",
      });
      assert(adminReportAccess.allowed === true, "Admin with global report:read access is ALLOWED");
    }

    // ----------------------------------------------------
    // TEST 10: Auditor Write Access Denial
    // ----------------------------------------------------
    console.log("\n10. Testing Auditor Read-Only Enforcement...");
    const tokenAuditor = await createAccessToken({
      userId: userAuditor.id,
      email: userAuditor.email,
      roles: ["AUDITOR"],
      permissions: ["incident:read:all", "report:read", "audit:read"],
    });

    {
      const { req, res } = createMockReqRes({ authHeader: `Bearer ${tokenAuditor}` });
      await runMiddleware(requireAuth, req, res);
      const auditorUser = req.user!;

      // Auditor reading an incident -> ALLOWED
      const readResult = authorizeResourceAccess(auditorUser, {
        actionPrefix: "incident:read",
        ownerId: userA.id,
        isWriteAction: false,
      });
      assert(readResult.allowed === true, "Auditor reading incident is ALLOWED (incident:read:all)");

      // Auditor attempting to write/mutate -> STRICTLY DENIED
      const writeResult = authorizeResourceAccess(auditorUser, {
        actionPrefix: "incident:update",
        ownerId: userA.id,
        isWriteAction: true,
      });
      assert(writeResult.allowed === false, "Auditor attempting write action is STRICTLY DENIED");
      assert(
        Boolean(writeResult.reason?.includes("read-only")),
        "Rejection reason states auditor read-only restriction"
      );
    }

    // ----------------------------------------------------
    // TEST 11: Real-time Authority & Cache Invalidation
    // ----------------------------------------------------
    console.log("\n11. Testing Dynamic Authority (No stale JWT permissions)...");
    {
      // Create a stale JWT that claims userB has 'ADMIN' role and 'user:disable' permission
      const forgedJwt = await createAccessToken({
        userId: userB.id,
        email: userB.email,
        roles: ["ADMIN"],
        permissions: ["user:disable"],
      });

      const { req, res } = createMockReqRes({ authHeader: `Bearer ${forgedJwt}` });
      await runMiddleware(requireAuth, req, res);

      // Even though JWT claims ADMIN, database has EMPLOYEE
      assert(
        req.user?.hasRole("ADMIN") === false,
        "Middleware disregards forged ADMIN role from JWT payload"
      );
      assert(
        req.user?.hasRole("EMPLOYEE") === true,
        "Middleware hydrates authentic EMPLOYEE role from database"
      );
      assert(
        req.user?.hasPermission("user:disable") === false,
        "Middleware disregards forged user:disable permission from JWT"
      );
    }
  } finally {
    // ----------------------------------------------------
    // Cleanup Test Data
    // ----------------------------------------------------
    console.log("\nCleaning up test accounts...");
    await prisma.user.deleteMany({
      where: {
        id: { in: [userA.id, userB.id, userAdmin.id, userAuditor.id] },
      },
    });
    console.log("Cleanup complete.");
  }

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log("\n========================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("========================================");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTests()
  .catch((err) => {
    console.error("RBAC test execution failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    try {
      if (redis.status !== "end") {
        await redis.quit();
      }
    } catch {}
  });
