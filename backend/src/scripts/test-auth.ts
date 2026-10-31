import { prisma } from "../config/prisma.js";
import { authService, AuthError } from "../modules/auth/auth.service.js";
import { verifyAccessToken, hashRefreshToken } from "../utils/tokens.js";
import { SignJWT } from "jose";
import { env } from "../config/env.js";

const testMeta = {
  ipAddress: "127.0.0.1",
  userAgent: "SurakshaTestAgent/1.0",
};

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

async function runTests(): Promise<void> {
  console.log("========================================");
  console.log("       SURAKSHA AUTHENTICATION TESTS    ");
  console.log("========================================");

  const timestamp = Date.now();
  const testEmail = `auth_test_${timestamp}@suraksha.local`;
  const testPassword = "StrongPassword123!";
  const testFirstName = "Kavya";
  const testLastName = "Sharma";

  // ----------------------------------------------------
  // TEST 1: User Registration
  // ----------------------------------------------------
  console.log("\n1. Testing Registration...");
  const registerResult = await authService.register(
    {
      email: testEmail,
      password: testPassword,
      firstName: testFirstName,
      lastName: testLastName,
    },
    testMeta
  );

  assert(Boolean(registerResult.user.id), "Registration returns user with ID");
  assert(registerResult.user.email === testEmail, "Registration email matches");
  assert(
    registerResult.user.roles.includes("EMPLOYEE"),
    "Registration defaults to EMPLOYEE role"
  );
  assert(
    registerResult.user.permissions.includes("incident:create"),
    "User inherits EMPLOYEE permissions"
  );

  // Check database password hashing
  const dbUser = await prisma.user.findUnique({
    where: { id: registerResult.user.id },
  });
  assert(
    Boolean(dbUser?.passwordHash.startsWith("$argon2id$")),
    "Password is encrypted with Argon2id"
  );
  assert(dbUser?.passwordHash !== testPassword, "Plaintext password is never stored");

  // Check Audit Log for registration
  const registerAudit = await prisma.auditLog.findFirst({
    where: {
      action: "AUTH_REGISTER",
      entityId: registerResult.user.id,
    },
  });
  assert(Boolean(registerAudit), "AUTH_REGISTER audit log recorded in database");

  // Test Duplicate Registration Prevention
  let duplicateFailedAsExpected = false;
  try {
    await authService.register(
      {
        email: testEmail,
        password: testPassword,
        firstName: testFirstName,
        lastName: testLastName,
      },
      testMeta
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode === 409) {
      duplicateFailedAsExpected = true;
    }
  }
  assert(duplicateFailedAsExpected, "Duplicate email registration rejected with 409");

  // ----------------------------------------------------
  // TEST 2: Login with Valid Credentials
  // ----------------------------------------------------
  console.log("\n2. Testing Login with Valid Credentials...");
  const loginResult = await authService.login(
    {
      email: testEmail,
      password: testPassword,
    },
    testMeta
  );

  assert(Boolean(loginResult.accessToken), "Login returns JWT access token");
  assert(Boolean(loginResult.refreshToken), "Login returns raw refresh token");
  assert(loginResult.user.email === testEmail, "Returned user email matches");

  // Verify JWT access token claims
  const verifiedClaims = await verifyAccessToken(loginResult.accessToken);
  assert(verifiedClaims.sub === registerResult.user.id, "JWT sub claim matches user ID");
  assert(verifiedClaims.email === testEmail, "JWT email claim matches");
  assert(verifiedClaims.roles.includes("EMPLOYEE"), "JWT contains user roles");

  // Verify refresh session in DB
  const initialTokenHash = hashRefreshToken(loginResult.refreshToken);
  const session1 = await prisma.refreshSession.findUnique({
    where: { tokenHash: initialTokenHash },
  });
  assert(Boolean(session1), "RefreshSession record created in database");
  assert(session1?.userId === registerResult.user.id, "RefreshSession linked to user ID");
  assert(Boolean(session1?.familyId), "RefreshSession has a familyId");
  assert(session1?.revokedAt === null, "New RefreshSession is active (not revoked)");

  // Verify Login Audit Log
  const loginAudit = await prisma.auditLog.findFirst({
    where: {
      action: "AUTH_LOGIN_SUCCESS",
      actorId: registerResult.user.id,
    },
  });
  assert(Boolean(loginAudit), "AUTH_LOGIN_SUCCESS audit log recorded");

  // ----------------------------------------------------
  // TEST 3: Login with Invalid Password & Lockout Check
  // ----------------------------------------------------
  console.log("\n3. Testing Invalid Password & Failed Attempts...");
  let invalidPasswordFailed = false;
  try {
    await authService.login(
      {
        email: testEmail,
        password: "WrongPassword999!",
      },
      testMeta
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode === 401) {
      invalidPasswordFailed = true;
    }
  }
  assert(invalidPasswordFailed, "Invalid password rejected with 401");

  const userAfterFailed = await prisma.user.findUnique({
    where: { id: registerResult.user.id },
  });
  assert(
    userAfterFailed?.failedLoginAttempts === 1,
    "failedLoginAttempts incremented to 1"
  );

  // ----------------------------------------------------
  // TEST 4: Account Inactivity & Status Restrictions
  // ----------------------------------------------------
  console.log("\n4. Testing Account Status Rejections...");

  // 4a. Suspended Account
  await prisma.user.update({
    where: { id: registerResult.user.id },
    data: { status: "SUSPENDED" },
  });

  let suspendedRejected = false;
  try {
    await authService.login(
      { email: testEmail, password: testPassword },
      testMeta
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode === 403 && error.code === "ACCOUNT_SUSPENDED") {
      suspendedRejected = true;
    }
  }
  assert(suspendedRejected, "Suspended account login rejected with 403 ACCOUNT_SUSPENDED");

  // 4b. Disabled Account
  await prisma.user.update({
    where: { id: registerResult.user.id },
    data: { status: "DISABLED" },
  });

  let disabledRejected = false;
  try {
    await authService.login(
      { email: testEmail, password: testPassword },
      testMeta
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode === 403 && error.code === "ACCOUNT_DISABLED") {
      disabledRejected = true;
    }
  }
  assert(disabledRejected, "Disabled account login rejected with 403 ACCOUNT_DISABLED");

  // 4c. Locked Account
  await prisma.user.update({
    where: { id: registerResult.user.id },
    data: {
      status: "ACTIVE",
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  let lockedRejected = false;
  try {
    await authService.login(
      { email: testEmail, password: testPassword },
      testMeta
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode === 423 && error.code === "ACCOUNT_LOCKED") {
      lockedRejected = true;
    }
  }
  assert(lockedRejected, "Locked account login rejected with 423 ACCOUNT_LOCKED");

  // Restore user to ACTIVE and reset lock
  await prisma.user.update({
    where: { id: registerResult.user.id },
    data: { status: "ACTIVE", lockedUntil: null, failedLoginAttempts: 0 },
  });

  // ----------------------------------------------------
  // TEST 5: Refresh Token Rotation
  // ----------------------------------------------------
  console.log("\n5. Testing Token Rotation...");
  const refresh1 = await authService.refresh(loginResult.refreshToken, testMeta);

  assert(Boolean(refresh1.accessToken), "Refresh returns new access token");
  assert(Boolean(refresh1.refreshToken), "Refresh returns new refresh token");
  assert(
    refresh1.refreshToken !== loginResult.refreshToken,
    "New refresh token is different from old refresh token (Rotated)"
  );

  // Check old session in DB is marked ROTATED
  const oldSession = await prisma.refreshSession.findUnique({
    where: { tokenHash: initialTokenHash },
  });
  assert(oldSession?.revokedAt !== null, "Old refresh session is revoked");
  assert(oldSession?.revokeReason === "ROTATED", "Old session revokeReason is ROTATED");

  // Check new session has same familyId
  const newSessionHash = hashRefreshToken(refresh1.refreshToken);
  const newSession = await prisma.refreshSession.findUnique({
    where: { tokenHash: newSessionHash },
  });
  assert(Boolean(newSession), "New refresh session exists in database");
  assert(
    newSession?.familyId === oldSession?.familyId,
    "New session maintains the same familyId"
  );

  // ----------------------------------------------------
  // TEST 6: Refresh Token Reuse Detection
  // ----------------------------------------------------
  console.log("\n6. Testing Refresh Token Reuse Detection...");
  let reuseDetected = false;
  try {
    // Attempting to reuse the OLD token which was already rotated!
    await authService.refresh(loginResult.refreshToken, testMeta);
  } catch (error) {
    if (
      error instanceof AuthError &&
      error.statusCode === 401 &&
      error.code === "TOKEN_REUSE_DETECTED"
    ) {
      reuseDetected = true;
    }
  }
  assert(reuseDetected, "Reusing rotated token triggers TOKEN_REUSE_DETECTED");

  // Verify all sessions in that family are now revoked with REUSE_DETECTED
  const familySessions = await prisma.refreshSession.findMany({
    where: { familyId: oldSession!.familyId },
  });
  const allRevoked = familySessions.every((s) => s.revokedAt !== null);
  const hasReuseReason = familySessions.some((s) => s.revokeReason === "REUSE_DETECTED");
  assert(allRevoked, "All sessions in the compromised token family are immediately revoked");
  assert(hasReuseReason, "Compromised family marked with REUSE_DETECTED");

  // ----------------------------------------------------
  // TEST 7: Expired JWT Access Token Rejection
  // ----------------------------------------------------
  console.log("\n7. Testing Expired Access Token Rejection...");
  const secretKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  const expiredJwt = await new SignJWT({
    email: testEmail,
    roles: ["EMPLOYEE"],
    permissions: [],
    tokenType: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(registerResult.user.id)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // 30 minutes in the past
    .sign(secretKey);

  let expiredRejected = false;
  try {
    await verifyAccessToken(expiredJwt);
  } catch {
    expiredRejected = true;
  }
  assert(expiredRejected, "Expired access token is rejected during verification");

  // ----------------------------------------------------
  // TEST 8: Logout and Session Revocation
  // ----------------------------------------------------
  console.log("\n8. Testing Logout & Revocation...");
  const login2 = await authService.login(
    { email: testEmail, password: testPassword },
    testMeta
  );

  await authService.logout(login2.refreshToken, testMeta);

  const logoutHash = hashRefreshToken(login2.refreshToken);
  const loggedOutSession = await prisma.refreshSession.findUnique({
    where: { tokenHash: logoutHash },
  });

  assert(loggedOutSession?.revokedAt !== null, "Refresh session is marked revoked on logout");
  assert(loggedOutSession?.revokeReason === "LOGOUT", "Revoke reason is LOGOUT");

  const logoutAudit = await prisma.auditLog.findFirst({
    where: {
      action: "AUTH_LOGOUT",
      actorId: registerResult.user.id,
    },
  });
  assert(Boolean(logoutAudit), "AUTH_LOGOUT audit log recorded");

  // ----------------------------------------------------
  // Cleanup test data
  // ----------------------------------------------------
  console.log("\nCleaning up test user and sessions...");
  await prisma.user.delete({
    where: { id: registerResult.user.id },
  });
  console.log("Cleanup complete.");

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
    console.error("Test execution failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

