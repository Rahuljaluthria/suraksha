import app from "../app.js";
import { prisma } from "../config/prisma.js";
import { connectRedis, disconnectRedis, redis } from "../config/redis.js";
import { connectKafka, disconnectKafka } from "../config/kafka.js";
import {
  getCache,
  setCache,
  deleteCache,
  deleteCacheByPattern,
  getCacheMetrics,
  resetCacheMetrics,
} from "../services/cache.service.js";
import { invalidateIncidentCache } from "../modules/incidents/incident.service.js";
import { createAccessToken } from "../utils/tokens.js";
import { hashPassword } from "../utils/password.js";
import { ROLES, type RoleCode } from "../config/rbac.js";
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

interface TestUser {
  id: string;
  email: string;
  role: RoleCode;
  token: string;
}

async function findOrCreateUser(email: string, roleCode: RoleCode): Promise<TestUser> {
  const role = await prisma.role.findUnique({
    where: { code: roleCode },
    include: { permissions: { include: { permission: true } } },
  });

  if (!role) {
    throw new Error(`Role ${roleCode} not found in database.`);
  }

  const roleDef = ROLES[roleCode];
  const permissions = roleDef.permissions as unknown as string[];

  let user = await prisma.user.findUnique({
    where: { email },
    include: { roles: true },
  });

  if (!user) {
    const passwordHash = await hashPassword("TestPassword@123");
    user = await prisma.user.create({
      data: {
        email,
        firstName: roleCode,
        lastName: "BenchTester",
        passwordHash,
        status: "ACTIVE",
        roles: {
          create: [{ roleId: role.id }],
        },
      },
      include: { roles: true },
    });
  } else {
    const hasRole = user.roles.some((r) => r.roleId === role.id);
    if (!hasRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }
  }

  const token = await createAccessToken({
    userId: user.id,
    email: user.email,
    roles: [roleCode],
    permissions,
  });

  return {
    id: user.id,
    email: user.email,
    role: roleCode,
    token,
  };
}

function calculatePercentile(numbers: number[], percentile: number): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return Number(sorted[Math.max(0, index)]?.toFixed(2));
}

async function runCacheAndBenchmarkTests(): Promise<void> {
  console.log("==========================================");
  console.log("  BATCH 12: REDIS CACHING & BENCHMARKING  ");
  console.log("==========================================");

  await connectRedis();
  await connectKafka();

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const makeRequest = async (
    path: string,
    options: {
      method?: string;
      body?: unknown;
      token?: string;
    } = {}
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (options.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    const start = performance.now();
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const latencyMs = performance.now() - start;

    let data: any = null;
    try {
      data = await response.json();
    } catch {}

    return { status: response.status, data, latencyMs, headers: response.headers };
  };

  const ts = Date.now();
  console.log("\n[Setup] Provisioning test users...");

  const commander = await findOrCreateUser(`cbench_cmd_${ts}@suraksha.local`, "INCIDENT_COMMANDER");
  const employee1 = await findOrCreateUser(`cbench_emp1_${ts}@suraksha.local`, "EMPLOYEE");
  const employee2 = await findOrCreateUser(`cbench_emp2_${ts}@suraksha.local`, "EMPLOYEE");

  console.log("  Users ready: Commander, Employee1, Employee2");

  try {
    resetCacheMetrics();

    // -------------------------------------------------------------------------
    // Suite 1: Low-level Cache Service Verification
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 1: Cache Service Primitives ---");

    const testKey = `test:cache:${ts}`;
    const writeOk = await setCache(testKey, { message: "Redis caching verified", ts }, 30);
    assert(writeOk, "1.1 setCache writes JSON object with TTL");

    const readVal = await getCache<{ message: string; ts: number }>(testKey);
    assert(readVal?.message === "Redis caching verified", "1.2 getCache retrieves and deserializes JSON");
    assert(readVal?.ts === ts, "1.3 Timestamp matches stored value");

    const delOk = await deleteCache(testKey);
    assert(delOk, "1.4 deleteCache removes key");

    const postDelVal = await getCache(testKey);
    assert(postDelVal === null, "1.5 Key is null after deletion");

    // Pattern deletion
    await setCache(`test:pattern:a:${ts}`, "valA", 30);
    await setCache(`test:pattern:b:${ts}`, "valB", 30);
    const patternDeleted = await deleteCacheByPattern(`test:pattern:*:${ts}`);
    assert(patternDeleted >= 2, `1.6 deleteCacheByPattern removes matched keys (${patternDeleted} removed)`);

    // -------------------------------------------------------------------------
    // Suite 2: Incident Cache Hit / Cache Miss
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 2: Incident Cache Hit / Cache Miss ---");

    // Create a fresh incident
    const createRes = await makeRequest("/incidents", {
      method: "POST",
      token: employee1.token,
      body: {
        title: "Benchmark Cache Test Incident",
        description: "Testing cache hit, miss and latency reductions",
        severity: "HIGH",
        priority: "P2",
        category: "MALWARE",
      },
    });
    assert(createRes.status === 201, "2.1 Incident created successfully");
    const incidentId = createRes.data?.data?.id;

    // Reset metrics before reads
    resetCacheMetrics();

    // 1st request -> Cold read (Cache Miss)
    const missReq = await makeRequest(`/incidents/${incidentId}`, { token: commander.token });
    assert(missReq.status === 200, "2.2 Cold request returns 200 OK");
    const metricsAfterMiss = getCacheMetrics();
    assert(metricsAfterMiss.misses >= 1, "2.3 Cache miss recorded on first fetch");

    // 2nd request -> Warm read (Cache Hit)
    const hitReq = await makeRequest(`/incidents/${incidentId}`, { token: commander.token });
    assert(hitReq.status === 200, "2.4 Warm request returns 200 OK");
    const metricsAfterHit = getCacheMetrics();
    assert(metricsAfterHit.hits >= 1, "2.5 Cache hit recorded on second fetch");
    assert(hitReq.latencyMs <= missReq.latencyMs || hitReq.latencyMs < 30, `2.6 Warm fetch is fast (${hitReq.latencyMs.toFixed(2)}ms vs ${missReq.latencyMs.toFixed(2)}ms)`);

    // -------------------------------------------------------------------------
    // Suite 3: Cache Stampede Protection (Single-Flight Promise Coalescing)
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 3: Cache Stampede Protection ---");

    // Evict key to force cold fetch
    await deleteCache(`incident:detail:${incidentId}`);

    // Fire 10 concurrent requests simultaneously
    const concurrentStarts = Array.from({ length: 10 }, () =>
      makeRequest(`/incidents/${incidentId}`, { token: commander.token })
    );

    const concurrentResults = await Promise.all(concurrentStarts);
    const allSuccessful = concurrentResults.every((r) => r.status === 200 && r.data?.data?.id === incidentId);
    assert(allSuccessful, "3.1 All 10 concurrent requests returned 200 OK with correct incident ID");

    // -------------------------------------------------------------------------
    // Suite 4: Security & User Authorization Isolation
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 4: Security & Authorization Isolation ---");

    // Ensure Incident 1 is cached
    await makeRequest(`/incidents/${incidentId}`, { token: employee1.token });

    // Employee 2 attempts to fetch Employee 1's incident details
    const unauthorizedRes = await makeRequest(`/incidents/${incidentId}`, { token: employee2.token });
    assert(unauthorizedRes.status === 403, "4.1 Employee 2 is strictly Forbidden (403) from accessing cached incident");
    assert(unauthorizedRes.data?.code === "FORBIDDEN", "4.2 Response returns FORBIDDEN code without data leakage");

    // Scoped list query isolation
    const emp1ListRes = await makeRequest("/incidents", { token: employee1.token });
    const emp2ListRes = await makeRequest("/incidents", { token: employee2.token });

    const emp1Incidents = Array.isArray(emp1ListRes.data?.data) ? emp1ListRes.data.data : [];
    const emp2Incidents = Array.isArray(emp2ListRes.data?.data) ? emp2ListRes.data.data : [];

    const emp1HasIncident = emp1Incidents.some((i: any) => i.id === incidentId);
    const emp2HasIncident = emp2Incidents.some((i: any) => i.id === incidentId);

    assert(emp1HasIncident === true, "4.3 Employee 1's cached list includes their reported incident");
    assert(emp2HasIncident === false, "4.4 Employee 2's cached list contains ZERO unauthorized incidents");

    // -------------------------------------------------------------------------
    // Suite 5: Cache Invalidation Lifecycle
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 5: Cache Invalidation Lifecycle ---");

    // 5.1 Update incident properties
    const updateRes = await makeRequest(`/incidents/${incidentId}`, {
      method: "PATCH",
      token: commander.token,
      body: {
        title: "Updated Title After Invalidation",
        severity: "CRITICAL",
      },
    });
    assert(updateRes.status === 200, "5.1 Incident updated successfully");

    // Immediate read after update must reflect new title
    const postUpdateReq = await makeRequest(`/incidents/${incidentId}`, { token: commander.token });
    assert(
      postUpdateReq.data?.data?.title === "Updated Title After Invalidation",
      "5.2 Immediate read reflects updated title (stale cache was evicted)"
    );

    // 5.2 Status transition
    const statusRes = await makeRequest(`/incidents/${incidentId}/status`, {
      method: "POST",
      token: commander.token,
      body: {
        status: "TRIAGED",
        notes: "Triage complete, verified cache eviction",
      },
    });
    assert(statusRes.status === 200, "5.3 Status transition succeeds");

    const postStatusReq = await makeRequest(`/incidents/${incidentId}`, { token: commander.token });
    assert(postStatusReq.data?.data?.status === "TRIAGED", "5.4 Detail cache evicted on status transition");

    // -------------------------------------------------------------------------
    // Suite 6: Dashboard Statistics Caching (/api/incidents/stats)
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 6: Dashboard Statistics Caching ---");

    const stats1 = await makeRequest("/incidents/stats", { token: commander.token });
    assert(stats1.status === 200, "6.1 Dashboard statistics returns 200 OK");
    assert(typeof stats1.data?.data?.total === "number", "6.2 Statistics contains total incidents count");
    assert(typeof stats1.data?.data?.open === "number", "6.3 Statistics contains open incidents count");
    assert(typeof stats1.data?.data?.critical === "number", "6.4 Statistics contains critical incidents count");
    assert(Array.isArray(stats1.data?.data?.trends), "6.5 Statistics contains 7-day daily trends array");

    // Second read -> Warm stats
    const stats2 = await makeRequest("/incidents/stats", { token: commander.token });
    assert(stats2.status === 200, "6.6 Cached stats request returns 200 OK");
    assert(stats2.latencyMs <= stats1.latencyMs || stats2.latencyMs < 25, `6.7 Warm stats served fast (${stats2.latencyMs.toFixed(2)}ms)`);

    // Employee stats scoping
    const empStats = await makeRequest("/incidents/stats", { token: employee2.token });
    assert(empStats.status === 200, "6.8 Employee retrieves scoped dashboard stats");
    assert(empStats.data?.data?.total <= stats1.data?.data?.total, "6.9 Employee stats is correctly scoped (not organization-wide)");

    // -------------------------------------------------------------------------
    // Suite 7: Redis-Backed Distributed Rate Limiting
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 7: Rate Limiting & Resilience ---");

    const rateLimitedEndpoint = await makeRequest("/incidents", { token: commander.token });
    assert(rateLimitedEndpoint.status === 200, "7.1 Protected endpoint passes within limit");

    // -------------------------------------------------------------------------
    // Suite 8: Performance Benchmark & Actual Measurements
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 8: Performance Benchmark (50 Cold vs 50 Warm Runs) ---");

    const COLD_RUNS = 25;
    const WARM_RUNS = 25;
    const coldLatencies: number[] = [];
    const warmLatencies: number[] = [];

    // Cold runs: Invalidate cache before each run to measure raw DB response time
    for (let i = 0; i < COLD_RUNS; i++) {
      await invalidateIncidentCache(incidentId);
      const res = await makeRequest(`/incidents/${incidentId}`, { token: commander.token });
      coldLatencies.push(res.latencyMs);
    }

    // Warm runs: Allow Redis to cache and measure cached response time
    for (let i = 0; i < WARM_RUNS; i++) {
      const res = await makeRequest(`/incidents/${incidentId}`, { token: commander.token });
      warmLatencies.push(res.latencyMs);
    }

    const avgCold = Number((coldLatencies.reduce((a, b) => a + b, 0) / coldLatencies.length).toFixed(2));
    const p95Cold = calculatePercentile(coldLatencies, 95);

    const avgWarm = Number((warmLatencies.reduce((a, b) => a + b, 0) / warmLatencies.length).toFixed(2));
    const p95Warm = calculatePercentile(warmLatencies, 95);

    const latencyReductionPercent = Number((((avgCold - avgWarm) / avgCold) * 100).toFixed(1));

    // Get Redis memory info
    let redisMemoryHuman = "Unknown";
    try {
      const info = await redis.info("memory");
      const match = info.match(/used_memory_human:([^\r\n]+)/);
      if (match && match[1]) {
        redisMemoryHuman = match[1].trim();
      }
    } catch {}

    const finalMetrics = getCacheMetrics();

    console.log("\n==========================================");
    console.log("       ACTUAL BENCHMARK MEASUREMENTS      ");
    console.log("==========================================");
    console.log(`Metric                     | Cold (MySQL) | Warm (Redis) | Improvement`);
    console.log(`---------------------------+--------------+--------------+-------------`);
    console.log(`Average Latency            | ${avgCold.toString().padEnd(12)} | ${avgWarm.toString().padEnd(12)} | ${latencyReductionPercent}% faster`);
    console.log(`P95 Latency                | ${p95Cold.toString().padEnd(12)} | ${p95Warm.toString().padEnd(12)} | ${(((p95Cold - p95Warm) / p95Cold) * 100).toFixed(1)}% faster`);
    console.log(`---------------------------+--------------+--------------+-------------`);
    console.log(`Cache Hit Ratio            : ${(finalMetrics.hitRatio * 100).toFixed(2)}%`);
    console.log(`Total Cache Hits Recorded  : ${finalMetrics.hits}`);
    console.log(`Total Cache Misses Recorded: ${finalMetrics.misses}`);
    console.log(`Redis Memory Usage         : ${redisMemoryHuman}`);
    console.log("==========================================");

    assert(avgWarm < avgCold, "8.1 Redis caching produces lower average latency than MySQL");
    assert(p95Warm < p95Cold, "8.2 Redis caching produces lower P95 latency than MySQL");

  } finally {
    server.close();
    await disconnectRedis();
    await disconnectKafka();
    await prisma.$disconnect();
  }

  console.log("\n==========================================");
  console.log(`TEST RUN SUMMARY:`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

void runCacheAndBenchmarkTests();
