/**
 * SOC dashboard backend tests: health score model, extended incident stats, system health,
 * notifications and security activity. Uses the real local MySQL, Redis and Kafka.
 * Run with `npm run test:dashboard`.
 */
import type { Server } from "node:http";
import app from "../app.js";
import { prisma } from "../config/prisma.js";
import { disconnectRedis } from "../config/redis.js";
import { ROLES, type RoleCode } from "../config/rbac.js";
import { createAccessToken } from "../utils/tokens.js";
import { hashPassword } from "../utils/password.js";
import { computeHealthScore, bandForScore } from "../modules/incidents/incident.health.js";
import { bucketActivity, detectSignals, type ActivityCategory } from "../modules/security/security.service.js";
import { summarise, type ServiceHealth } from "../modules/system/health.service.js";

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

async function findOrCreateUser(email: string, roleCode: RoleCode) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new Error(`Role ${roleCode} missing. Run npm run db:seed first.`);

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        firstName: roleCode,
        lastName: "Tester",
        passwordHash: await hashPassword("TestPassword@123"),
        status: "ACTIVE",
        roles: { create: [{ roleId: role.id }] },
      },
    });
  }

  const token = await createAccessToken({
    userId: user.id,
    email: user.email,
    roles: [roleCode],
    permissions: ROLES[roleCode].permissions as unknown as string[],
  });
  return { id: user.id, token };
}

const emptyCounts = (): Record<ActivityCategory, number> => ({
  LOGIN_SUCCESS: 0,
  LOGIN_FAILED: 0,
  ACCOUNT_LOCKED: 0,
  ACCESS_DENIED: 0,
  TOKEN_REUSE: 0,
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function run(): Promise<void> {
  console.log("========================================");
  console.log("   SOC DASHBOARD BACKEND TESTS          ");
  console.log("========================================");

  // ---------------------------------------------------------------
  console.log("\n--- Suite 1: Incident health score model ---");
  const zero = { openCritical: 0, openHigh: 0, escalated: 0, overdue: 0, resolvedCount: 0, resolvedWithinTarget: 0 };
  assert(computeHealthScore(zero).score === 100 && computeHealthScore(zero).band === "HEALTHY", "1.1 an empty queue scores 100 and is HEALTHY");
  assert(computeHealthScore({ ...zero, openCritical: 1 }).score === 85, "1.2 one open critical costs 15 points");
  const mixed = computeHealthScore({ ...zero, openCritical: 2, openHigh: 1 });
  assert(mixed.score === 64 && mixed.band === "ELEVATED", "1.3 two critical and one high score 64 (ELEVATED)");
  assert(computeHealthScore({ ...zero, openCritical: 10 }).score === 55, "1.4 critical deductions are capped at 45 points");
  const worst = computeHealthScore({ openCritical: 9, openHigh: 9, escalated: 9, overdue: 9, resolvedCount: 5, resolvedWithinTarget: 0 });
  assert(worst.score === 0 && worst.band === "CRITICAL", "1.5 the score floors at 0 and is CRITICAL");
  assert(
    [100, 80, 79, 50, 49, 0].map(bandForScore).join(",") === "HEALTHY,HEALTHY,ELEVATED,ELEVATED,CRITICAL,CRITICAL",
    "1.6 band boundaries are 80 and 50"
  );
  const fewResolved = computeHealthScore({ ...zero, resolvedCount: 2, resolvedWithinTarget: 0 });
  const perf = fewResolved.components.find((c) => c.key === "resolutionPerformance")!;
  assert(perf.deduction === 0 && /Needs at least 3/.test(perf.note ?? ""), "1.7 resolution performance is ignored until 3 incidents are resolved");
  const lateResolved = computeHealthScore({ ...zero, resolvedCount: 5, resolvedWithinTarget: 2 });
  assert(lateResolved.score === 94, "1.8 3 of 5 resolved late costs 6 points");
  assert(
    computeHealthScore({ ...zero, openCritical: 1, openHigh: 1, escalated: 1, overdue: 1 }).components.reduce((s, c) => s + c.deduction, 0) === 29,
    "1.9 every deduction is traceable through the components list"
  );

  // ---------------------------------------------------------------
  console.log("\n--- Suite 2: Security signals and bucketing ---");
  const c = (over: Partial<Record<ActivityCategory, number>>) => ({ ...emptyCounts(), ...over });
  assert(detectSignals(c({ LOGIN_FAILED: 4 }), 0).length === 0, "2.1 four failed logins raise no signal");
  assert(detectSignals(c({ LOGIN_FAILED: 5 }), 0).some((s) => s.type === "FAILED_LOGIN_BURST" && s.severity === "HIGH"), "2.2 five failed logins in a bucket is a HIGH burst");
  assert(detectSignals(c({ TOKEN_REUSE: 1 }), 0).some((s) => s.type === "TOKEN_REUSE" && s.severity === "CRITICAL"), "2.3 token reuse is CRITICAL");
  assert(detectSignals(c({ ACCOUNT_LOCKED: 1 }), 0).some((s) => s.type === "ACCOUNT_LOCKED" && s.severity === "HIGH"), "2.4 an account lockout is HIGH");
  assert(detectSignals(c({ ACCESS_DENIED: 5 }), 0).some((s) => s.type === "ACCESS_DENIED_BURST"), "2.5 repeated access denials are flagged");
  assert(detectSignals(c({ LOGIN_SUCCESS: 9 }), 0).length === 0, "2.6 nine successful logins is normal");
  assert(detectSignals(c({ LOGIN_SUCCESS: 10 }), 0).some((s) => s.type === "LOGIN_SURGE"), "2.7 ten logins in a quiet period is a surge");
  assert(detectSignals(c({ LOGIN_SUCCESS: 20 }), 10).length === 0, "2.8 20 logins is not a surge when the usual rate is 10 (needs 3x)");
  assert(detectSignals(c({ LOGIN_SUCCESS: 30 }), 10).some((s) => s.type === "LOGIN_SURGE"), "2.9 30 logins against a usual 10 is a surge");

  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const step = 30 * 60 * 1000;
  const rows = [
    { createdAt: new Date(start + 5 * 60 * 1000), action: "AUTH_LOGIN_FAILED" },
    { createdAt: new Date(start + 10 * 60 * 1000), action: "AUTH_LOGIN_FAILED" },
    { createdAt: new Date(start + step + 1000), action: "AUTHZ_FORBIDDEN_ROLE" },
    { createdAt: new Date(start + step + 2000), action: "AUTHZ_FORBIDDEN_PERMISSION" },
    { createdAt: new Date(start + 2 * step), action: "AUTH_REFRESH_TOKEN_REUSE_DETECTED" },
    { createdAt: new Date(start + 3 * step), action: "SOMETHING_ELSE" },
    { createdAt: new Date(start - 1000), action: "AUTH_LOGIN_FAILED" },
    { createdAt: new Date(start + 48 * step), action: "AUTH_LOGIN_FAILED" },
  ];
  const buckets = bucketActivity(rows, start, step);
  assert(buckets.length === 48 && buckets[0]!.start === new Date(start).toISOString(), "2.10 there are always 48 buckets starting at the window start");
  assert(buckets[0]!.counts.LOGIN_FAILED === 2 && buckets[1]!.counts.ACCESS_DENIED === 2 && buckets[2]!.counts.TOKEN_REUSE === 1, "2.11 events land in the right bucket and category");
  assert(buckets.reduce((s, b) => s + b.counts.LOGIN_FAILED, 0) === 2, "2.12 events outside the window and unknown actions are ignored");
  assert(buckets[2]!.signals.some((s) => s.type === "TOKEN_REUSE"), "2.13 signals are attached to their bucket");

  const svc = (key: ServiceHealth["key"], status: ServiceHealth["status"]): ServiceHealth => ({ key, label: key, status, latencyMs: 1, detail: null });
  const healthy = [svc("database", "UP"), svc("redis", "UP"), svc("kafka", "UP"), svc("eventPipeline", "UP"), svc("worker", "UNKNOWN")];
  assert(summarise(healthy) === "OPERATIONAL", "2.14 an unknown worker alone does not make the system look degraded");
  assert(summarise(healthy.map((s) => (s.key === "redis" ? svc("redis", "DOWN") : s))) === "DEGRADED", "2.15 Redis down is DEGRADED");
  assert(summarise(healthy.map((s) => (s.key === "database" ? svc("database", "DOWN") : s))) === "DOWN", "2.16 the database down is DOWN");
  assert(summarise(healthy.map((s) => (s.key === "eventPipeline" ? svc("eventPipeline", "DEGRADED") : s))) === "DEGRADED", "2.17 a degraded event pipeline is DEGRADED");

  // ---------------------------------------------------------------
  await prisma.$connect();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const get = async (path: string, token?: string) => {
    const response = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, data: (await response.json().catch(() => null)) as any, raw: "" };
  };

  const ts = Date.now();
  const empA = await findOrCreateUser(`dash_empA_${ts}@suraksha.local`, "EMPLOYEE");
  const empB = await findOrCreateUser(`dash_empB_${ts}@suraksha.local`, "EMPLOYEE");
  const admin = await findOrCreateUser(`dash_admin_${ts}@suraksha.local`, "ADMIN");
  const auditor = await findOrCreateUser(`dash_auditor_${ts}@suraksha.local`, "AUDITOR");
  const commander = await findOrCreateUser(`dash_cmd_${ts}@suraksha.local`, "INCIDENT_COMMANDER");

  // ---------------------------------------------------------------
  console.log("\n--- Suite 3: GET /api/incidents/stats (extended) ---");
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms);
  const mk = (suffix: string, data: Record<string, unknown>, history: Array<Record<string, unknown>>) =>
    prisma.incident.create({
      data: {
        incidentNumber: `TEST-DASH-${ts}-${suffix}`,
        title: `Dashboard fixture ${suffix}`,
        description: "Fixture for dashboard statistics",
        category: "MALWARE",
        reportedById: empA.id,
        ...data,
        history: { create: history },
      } as never,
    });

  const incA = await mk("A", { severity: "CRITICAL", status: "INVESTIGATING", createdAt: ago(30 * HOUR) }, [
    { action: "CREATED", toStatus: "NEW", createdAt: ago(30 * HOUR) },
    { action: "STATUS_CHANGE", fromStatus: "NEW", toStatus: "INVESTIGATING", createdAt: ago(29 * HOUR) },
  ]);
  const incB = await mk("B", { severity: "HIGH", status: "ESCALATED", createdAt: ago(2 * HOUR) }, [
    { action: "CREATED", toStatus: "NEW", createdAt: ago(2 * HOUR) },
    { action: "STATUS_CHANGE", fromStatus: "NEW", toStatus: "ESCALATED", createdAt: ago(1 * HOUR) },
  ]);
  const incC = await mk("C", { severity: "LOW", status: "RESOLVED", createdAt: ago(10 * HOUR), resolvedAt: ago(5 * HOUR) }, [
    { action: "CREATED", toStatus: "NEW", createdAt: ago(10 * HOUR) },
    { action: "STATUS_CHANGE", fromStatus: "NEW", toStatus: "RESOLVED", createdAt: ago(5 * HOUR) },
  ]);
  const incD = await mk("D", { severity: "MEDIUM", status: "RESOLVED", createdAt: ago(20 * DAY), resolvedAt: ago(10 * DAY) }, [
    { action: "CREATED", toStatus: "NEW", createdAt: ago(20 * DAY) },
    { action: "STATUS_CHANGE", fromStatus: "NEW", toStatus: "RESOLVED", createdAt: ago(10 * DAY) },
  ]);
  const incE = await mk("E", { severity: "MEDIUM", status: "CLOSED", createdAt: ago(40 * DAY), resolvedAt: ago(35 * DAY), closedAt: ago(35 * DAY) }, [
    { action: "CREATED", toStatus: "NEW", createdAt: ago(40 * DAY) },
    { action: "STATUS_CHANGE", fromStatus: "NEW", toStatus: "CLOSED", createdAt: ago(35 * DAY) },
  ]);
  const fixtureIds = [incA.id, incB.id, incC.id, incD.id, incE.id];

  assert((await get("/incidents/stats")).status === 401, "3.1 stats require authentication");
  const adminStats = await get("/incidents/stats", admin.token);
  assert(adminStats.status === 403 && adminStats.data.code === "FORBIDDEN_PERMISSION", "3.2 ADMIN has no incident permissions and is refused");

  const stats1 = await get("/incidents/stats", empA.token);
  const s = stats1.data?.data;
  assert(stats1.status === 200 && s.scope === "own" && s.total === 5, "3.3 an employee gets stats scoped to their own incidents only");
  assert(s?.open === 2 && s.openBySeverity.CRITICAL === 1 && s.openBySeverity.HIGH === 1 && s.critical === 1, "3.4 open counts exclude RESOLVED and CLOSED; critical means open critical");
  assert(s?.escalated === 1, "3.5 escalated count comes from ESCALATED incidents");
  assert(s?.overdue.total === 1 && s.overdue.bySeverity.CRITICAL === 1, "3.6 a 30-hour-old open critical is overdue against its 24-hour target; a 2-hour-old high is not");
  assert(
    s?.resolution.resolvedCount === 2 && s.resolution.meanHours === 122.5 && s.resolution.withinTargetCount === 1 && s.resolution.withinTargetPct === 0.5,
    "3.7 resolution stats cover the last 30 days (5h and 240h resolutions; the 35-day-old closure is outside)"
  );
  assert(s?.health.score === 71 && s.health.band === "ELEVATED", "3.8 health score is 71 (100 - 15 critical - 6 high - 5 escalated - 3 overdue)");
  assert(
    s?.health.components.find((x: any) => x.key === "resolutionPerformance")?.deduction === 0 &&
      /Needs at least 3/.test(s.health.components.find((x: any) => x.key === "resolutionPerformance")?.note ?? ""),
    "3.9 with only two resolved incidents, resolution performance is not scored"
  );
  assert(
    s?.previous && s.previous.health.score === 100 && s.previous.openBySeverity.CRITICAL === 0 &&
      Math.abs(new Date(s.previous.asOf).getTime() - (now - 7 * DAY)) < 60_000,
    "3.10 the seven-day-old snapshot is rebuilt from history (only D and E existed, both already resolved or closed)"
  );
  assert(
    s?.activity.buckets.length === 48 && s.activity.buckets.reduce((sum: number, b: any) => sum + b.HIGH + b.LOW + b.MEDIUM + b.CRITICAL, 0) === 2 &&
      s.activity.buckets.reduce((sum: number, b: any) => sum + b.HIGH, 0) === 1,
    "3.11 24-hour activity buckets hold the two incidents created in that window (high and low), not the 30-hour-old one"
  );
  assert(Array.isArray(s?.trends) && typeof s?.bySeverity?.LOW === "number", "3.12 the original fields are unchanged");

  const stats2 = await get("/incidents/stats", empA.token);
  assert(stats2.data?.data?.generatedAt === s?.generatedAt, "3.13 a repeat request within 60 seconds is served from the Redis cache");

  const bOnly = await mk("F", { severity: "LOW", status: "NEW", createdAt: ago(1 * HOUR), reportedById: empB.id }, [
    { action: "CREATED", toStatus: "NEW", createdAt: ago(1 * HOUR) },
  ]);
  fixtureIds.push(bOnly.id);
  const empBStats = await get("/incidents/stats", empB.token);
  assert(empBStats.data?.data?.total === 1 && empBStats.data.data.previous === null, "3.14 another employee sees only their own incident, and there is no previous snapshot when nothing existed seven days ago");
  const cmdStats = await get("/incidents/stats", commander.token);
  assert(cmdStats.status === 200 && cmdStats.data.data.scope === "all" && cmdStats.data.data.total >= 6, "3.15 an incident commander gets organisation-wide stats");

  // ---------------------------------------------------------------
  console.log("\n--- Suite 4: GET /api/health/details ---");
  assert((await get("/health/details")).status === 401, "4.1 detailed health requires authentication");
  const health = await get("/health/details", empA.token);
  const h = health.data?.data;
  const bySvc = (key: string) => h?.services.find((x: any) => x.key === key);
  assert(health.status === 200 && h.services.length === 5, "4.2 five services are reported to any signed-in user");
  assert(bySvc("database")?.status === "UP" && bySvc("redis")?.status === "UP" && bySvc("kafka")?.status === "UP", "4.3 MySQL, Redis and Kafka are probed for real and are up in this environment");
  assert(["UP", "DEGRADED"].includes(bySvc("eventPipeline")?.status) && typeof bySvc("eventPipeline")?.detail === "string", "4.4 the event pipeline reports its outbox state");
  assert(bySvc("worker")?.status === "UNKNOWN", "4.5 the worker is reported as UNKNOWN because it records no heartbeat");
  assert(["OPERATIONAL", "DEGRADED"].includes(h?.overall) && typeof h?.uptimeSeconds === "number", "4.6 an overall status and uptime are included");
  assert(!/127\.0\.0\.1|localhost|3307|9094|6379|password|mysql:\/\//i.test(JSON.stringify(health.data)), "4.7 no hosts, ports or credentials are exposed");
  const health2 = await get("/health/details", empA.token);
  assert(health2.data?.data?.checkedAt === h?.checkedAt, "4.8 results are cached briefly so polling cannot hammer dependencies");

  // ---------------------------------------------------------------
  console.log("\n--- Suite 5: GET /api/notifications ---");
  const notes = await Promise.all([
    prisma.notification.create({ data: { userId: empA.id, title: "A1", message: "for A", type: "TEST", entityType: "INCIDENT", entityId: incA.id } }),
    prisma.notification.create({ data: { userId: empA.id, title: "A2", message: "for A", type: "TEST", isRead: true } }),
    prisma.notification.create({ data: { userId: empB.id, title: "B1", message: "for B", type: "TEST" } }),
  ]);
  assert((await get("/notifications")).status === 401, "5.1 notifications require authentication");
  const nA = await get("/notifications", empA.token);
  assert(
    nA.status === 200 && nA.data.data.items.length === 2 && nA.data.data.unreadCount === 1 &&
      nA.data.data.items.every((i: any) => ["A1", "A2"].includes(i.title)),
    "5.2 a user sees only their own notifications and their unread count"
  );
  assert(!("userId" in (nA.data.data.items[0] ?? {})), "5.3 notification payloads do not include user ids");
  const nB = await get("/notifications", empB.token);
  assert(nB.data.data.items.length === 1 && nB.data.data.items[0].title === "B1", "5.4 another user cannot see them (no IDOR through this endpoint)");
  assert((await get("/notifications?limit=0", empA.token)).status === 400 && (await get("/notifications?limit=500", empA.token)).status === 400, "5.5 out-of-range limits are rejected");
  assert((await get("/notifications?limit=1", empA.token)).data.data.items.length === 1, "5.6 limit is honoured");

  // ---------------------------------------------------------------
  console.log("\n--- Suite 6: GET /api/security/activity ---");
  assert((await get("/security/activity")).status === 401, "6.1 security activity requires authentication");
  const denied = await get("/security/activity", empA.token);
  assert(denied.status === 403 && denied.data.code === "FORBIDDEN_PERMISSION", "6.2 employees lack audit:read");
  assert((await get("/security/activity", commander.token)).status === 403, "6.3 incident commanders lack audit:read too");

  const before = await get("/security/activity?hours=24", admin.token);
  const b = before.data?.data;
  assert(before.status === 200 && b.buckets.length === 48 && b.bucketSeconds === 1800 && b.windowHours === 24, "6.4 ADMIN gets 48 half-hour buckets for 24 hours");
  assert((await get("/security/activity?hours=6", auditor.token)).data?.data?.bucketSeconds === 450, "6.5 AUDITOR can read it and a 6-hour window uses 450-second buckets");
  assert((await get("/security/activity?hours=5", admin.token)).status === 400, "6.6 unsupported windows are rejected");

  const marker = `victim_${ts}@example.test`;
  const auditRows = await Promise.all([
    ...Array.from({ length: 6 }, () =>
      prisma.auditLog.create({ data: { action: "AUTH_LOGIN_FAILED", ipAddress: "203.0.113.9", metadata: { email: marker } } })
    ),
    prisma.auditLog.create({ data: { action: "AUTH_REFRESH_TOKEN_REUSE_DETECTED", ipAddress: "203.0.113.9", metadata: { email: marker } } }),
  ]);
  const after = await get("/security/activity?hours=24", admin.token);
  const a = after.data?.data;
  assert(
    a.totals.LOGIN_FAILED - b.totals.LOGIN_FAILED === 6 && a.totals.TOKEN_REUSE - b.totals.TOKEN_REUSE === 1,
    "6.7 newly written audit events appear in the totals"
  );
  const lastBuckets = a.buckets.slice(-2);
  assert(
    lastBuckets.some((x: any) => x.signals.some((sg: any) => sg.type === "FAILED_LOGIN_BURST")) &&
      lastBuckets.some((x: any) => x.signals.some((sg: any) => sg.type === "TOKEN_REUSE" && sg.severity === "CRITICAL")),
    "6.8 six failed logins raise a burst signal and token reuse raises a CRITICAL signal"
  );
  assert(!after.data || !JSON.stringify(after.data).match(new RegExp(`${marker}|203\\.0\\.113\\.9|ipAddress|actorId`)), "6.9 only aggregates leave the endpoint: no emails, IP addresses or user ids");

  // ---------------------------------------------------------------
  // Clean up the rows this run created (users are left in place, like the other suites).
  await prisma.auditLog.deleteMany({ where: { id: { in: auditRows.map((r) => r.id) } } });
  await prisma.notification.deleteMany({ where: { id: { in: notes.map((n) => n.id) } } });
  await prisma.incident.deleteMany({ where: { id: { in: fixtureIds } } });

  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log("\n========================================");
  console.log("TEST RUN SUMMARY:");
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log("========================================");
}

run()
  .catch((err) => {
    console.error("Test execution failed:", err);
    failed++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    try {
      await disconnectRedis();
    } catch {
      // ignore
    }
    process.exit(failed > 0 ? 1 : 0);
  });
