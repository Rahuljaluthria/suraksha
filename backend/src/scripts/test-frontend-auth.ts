import app from "../app.js";
import { prisma } from "../config/prisma.js";
import type { Server } from "node:http";

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

async function runFrontendAuthTests(): Promise<void> {
  console.log("========================================");
  console.log("   FRONTEND AUTH INTEGRATION TEST SUITE ");
  console.log("========================================");

  // Start Express server on ephemeral port for integration testing
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  let cookieStore: string[] = [];

  const makeRequest = async (
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {}
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (cookieStore.length > 0) {
      headers["Cookie"] = cookieStore.join("; ");
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const setCookie = response.headers.getSetCookie?.() || [];
    if (setCookie.length > 0) {
      cookieStore = setCookie;
    }

    let data: any = null;
    try {
      data = await response.json();
    } catch {}

    return { status: response.status, data, headers: response.headers };
  };

  const timestamp = Date.now();
  const testEmail = `fe_user_${timestamp}@suraksha.local`;
  const testPassword = "StrongPassword123!";

  try {
    // ----------------------------------------------------
    // TEST 1: Registration
    // ----------------------------------------------------
    console.log("\n1. Testing Frontend Registration Endpoint...");
    const regRes = await makeRequest("/auth/register", {
      method: "POST",
      body: {
        email: testEmail,
        password: testPassword,
        firstName: "Frontend",
        lastName: "Tester",
      },
    });

    assert(regRes.status === 201, "Registration returns 201 Created");
    assert(regRes.data.success === true, "Response indicates success");
    assert(regRes.data.data.user.email === testEmail, "Registered email matches");
    assert(regRes.data.data.user.roles.includes("EMPLOYEE"), "User assigned EMPLOYEE role");

    // ----------------------------------------------------
    // TEST 2: Login & Cookie Setting
    // ----------------------------------------------------
    console.log("\n2. Testing Frontend Login & HttpOnly Cookie...");
    const loginRes = await makeRequest("/auth/login", {
      method: "POST",
      body: {
        email: testEmail,
        password: testPassword,
      },
    });

    assert(loginRes.status === 200, "Login returns 200 OK");
    assert(Boolean(loginRes.data.data.accessToken), "Access token returned in response body");
    const hasRefreshCookie = cookieStore.some((c) => c.includes("suraksha_refresh_token="));
    assert(hasRefreshCookie, "HttpOnly suraksha_refresh_token cookie received from server");

    let inMemoryToken = loginRes.data.data.accessToken;

    // ----------------------------------------------------
    // TEST 3: Invalid Credentials Rejection
    // ----------------------------------------------------
    console.log("\n3. Testing Invalid Credentials Rejection...");
    const invalidRes = await makeRequest("/auth/login", {
      method: "POST",
      body: {
        email: testEmail,
        password: "IncorrectPassword!",
      },
    });

    assert(invalidRes.status === 401, "Invalid password returns 401");
    assert(invalidRes.data?.code === "INVALID_CREDENTIALS", "Error code is INVALID_CREDENTIALS");

    // ----------------------------------------------------
    // TEST 4: Authenticated /me Request
    // ----------------------------------------------------
    console.log("\n4. Testing Protected /me Endpoint with Bearer Token...");
    const meRes = await makeRequest("/auth/me", {
      headers: { Authorization: `Bearer ${inMemoryToken}` },
    });

    assert(meRes.status === 200, "/me returns 200 OK");
    assert(meRes.data.data.user.email === testEmail, "User identity matches");
    assert(meRes.data.data.user.roles.includes("EMPLOYEE"), "User roles returned");

    // ----------------------------------------------------
    // TEST 5: Refresh Token Flow (HttpOnly Cookie Exchange)
    // ----------------------------------------------------
    console.log("\n5. Testing Refresh Token Exchange (Restore Session)...");
    await new Promise((r) => setTimeout(r, 1100));
    const refreshRes = await makeRequest("/auth/refresh", {
      method: "POST",
      body: {},
    });

    assert(refreshRes.status === 200, "/refresh returns 200 OK");
    assert(Boolean(refreshRes.data.data.accessToken), "New access token issued");
    assert(
      refreshRes.data.data.accessToken !== inMemoryToken,
      "New access token is distinct from previous token"
    );

    // Update in-memory token
    inMemoryToken = refreshRes.data.data.accessToken;

    // ----------------------------------------------------
    // TEST 6: Authenticated Request with Rotated Token
    // ----------------------------------------------------
    console.log("\n6. Testing /me with Rotated Token...");
    const meRes2 = await makeRequest("/auth/me", {
      headers: { Authorization: `Bearer ${inMemoryToken}` },
    });
    assert(meRes2.status === 200, "Rotated token successfully authenticates");

    // ----------------------------------------------------
    // TEST 7: Logout and Session Revocation
    // ----------------------------------------------------
    console.log("\n7. Testing Logout & Cookie Clearance...");
    const logoutRes = await makeRequest("/auth/logout", {
      method: "POST",
      body: {},
    });
    assert(logoutRes.status === 200, "/logout returns 200 OK");

    // Verify cookie cleared
    const isCookieCleared = cookieStore.some(
      (c) => c.includes("suraksha_refresh_token=;") || c.includes("Max-Age=0") || c.includes("Expires=")
    );
    assert(isCookieCleared, "Refresh cookie is cleared on logout");

    // Verify subsequent refresh fails
    const refreshAfterLogoutRes = await makeRequest("/auth/refresh", {
      method: "POST",
      body: {},
    });
    assert(refreshAfterLogoutRes.status === 401, "Subsequent refresh after logout is rejected (401)");
  } finally {
    // Cleanup
    server.close();
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
    await prisma.$disconnect();
  }

  console.log("\n========================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("========================================");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runFrontendAuthTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exitCode = 1;
});
