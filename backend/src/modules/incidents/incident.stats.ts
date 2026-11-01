import { prisma } from "../../config/prisma.js";
import { getOrSet } from "../../services/cache.service.js";
import type { AuthenticatedUser } from "../../middleware/auth.js";
import { ForbiddenOperationError } from "./incident.service.js";
import { Prisma, IncidentStatus, IncidentSeverity } from "../../generated/prisma/client.js";
import {
  RESOLUTION_TARGET_HOURS,
  computeHealthScore,
  type HealthInputs,
  type HealthScore,
} from "./incident.health.js";

export type StatsScope = "all" | "assigned" | "own" | "assigned_and_own";

export interface ActivityBucket {
  /** ISO timestamp of the bucket start. */
  start: string;
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  CRITICAL: number;
}

export interface ScoreSnapshot {
  /** ISO timestamp the snapshot describes. */
  asOf: string;
  openBySeverity: Record<IncidentSeverity, number>;
  escalated: number;
  overdue: number;
  health: HealthScore;
}

export interface IncidentStats {
  total: number;
  open: number;
  /** Open (not resolved, closed or rejected) incidents with CRITICAL severity. */
  critical: number;
  bySeverity: Record<IncidentSeverity, number>;
  byStatus: Record<IncidentStatus, number>;
  trends: Array<{ date: string; count: number }>;

  scope: StatsScope;
  generatedAt: string;
  openBySeverity: Record<IncidentSeverity, number>;
  escalated: number;
  overdue: { total: number; bySeverity: Record<IncidentSeverity, number> };
  resolution: {
    windowDays: number;
    resolvedCount: number;
    meanHours: number | null;
    withinTargetCount: number;
    withinTargetPct: number | null;
    truncated: boolean;
  };
  health: HealthScore;
  /** State seven days ago, rebuilt from incident history. Null when there is nothing to compare. */
  previous: ScoreSnapshot | null;
  activity: { windowHours: number; bucketMinutes: number; truncated: boolean; buckets: ActivityBucket[] };
}

const STATS_CACHE_TTL_SECONDS = 60;
const RESOLUTION_WINDOW_DAYS = 30;
const PREVIOUS_PERIOD_DAYS = 7;
const ACTIVITY_WINDOW_HOURS = 24;
const ACTIVITY_BUCKET_MINUTES = 30;
const MAX_ROWS = 5000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const CLOSED_STATUSES: readonly IncidentStatus[] = [
  IncidentStatus.RESOLVED,
  IncidentStatus.CLOSED,
  IncidentStatus.REJECTED,
];
const SEVERITIES: readonly IncidentSeverity[] = [
  IncidentSeverity.LOW,
  IncidentSeverity.MEDIUM,
  IncidentSeverity.HIGH,
  IncidentSeverity.CRITICAL,
];

const emptySeverityCounts = (): Record<IncidentSeverity, number> => ({ LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });

function buildStatsScopeCondition(user: AuthenticatedUser): Prisma.IncidentWhereInput {
  const hasUniversalRead = user.hasPermission("incident:read:all");
  const hasAssignedRead = user.hasPermission("incident:read:assigned");
  const hasOwnRead = user.hasPermission("incident:read:own");

  if (!hasUniversalRead && !hasAssignedRead && !hasOwnRead) {
    throw new ForbiddenOperationError("You do not have permission to view incident statistics");
  }

  if (hasUniversalRead) {
    return {};
  }

  if (hasAssignedRead && hasOwnRead) {
    return {
      OR: [
        { reportedById: user.id },
        { assignedToId: user.id },
        { assignments: { some: { userId: user.id, isActive: true } } },
      ],
    };
  }

  if (hasAssignedRead) {
    return {
      OR: [
        { assignedToId: user.id },
        { assignments: { some: { userId: user.id, isActive: true } } },
      ],
    };
  }

  return { reportedById: user.id };
}

function getStatsScope(user: AuthenticatedUser): StatsScope {
  if (user.hasPermission("incident:read:all")) return "all";
  const assigned = user.hasPermission("incident:read:assigned");
  const own = user.hasPermission("incident:read:own");
  if (assigned && own) return "assigned_and_own";
  return assigned ? "assigned" : "own";
}

export function getStatsCacheKey(user: AuthenticatedUser): string {
  const hasUniversalRead = user.hasPermission("incident:read:all");
  const scope = hasUniversalRead ? "all" : `user:${user.id}`;
  return `incident:stats:v2:${scope}`;
}

const and = (...conditions: Prisma.IncidentWhereInput[]): Prisma.IncidentWhereInput => ({ AND: conditions });

const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / HOUR_MS;

interface ResolvedRow {
  createdAt: Date;
  resolvedAt: Date | null;
  severity: IncidentSeverity;
}

function summariseResolution(rows: ResolvedRow[], truncated: boolean): IncidentStats["resolution"] {
  const durations = rows
    .filter((r): r is ResolvedRow & { resolvedAt: Date } => r.resolvedAt !== null)
    .map((r) => ({ hours: Math.max(0, hoursBetween(r.createdAt, r.resolvedAt)), severity: r.severity }));

  const withinTarget = durations.filter((d) => d.hours <= RESOLUTION_TARGET_HOURS[d.severity]).length;
  const meanHours =
    durations.length > 0
      ? Number((durations.reduce((sum, d) => sum + d.hours, 0) / durations.length).toFixed(1))
      : null;

  return {
    windowDays: RESOLUTION_WINDOW_DAYS,
    resolvedCount: durations.length,
    meanHours,
    withinTargetCount: withinTarget,
    withinTargetPct: durations.length > 0 ? Number((withinTarget / durations.length).toFixed(3)) : null,
    truncated,
  };
}

/**
 * Rebuilds what the queue looked like `asOf`, using the status history written on every
 * transition. Severity is the currently recorded severity (reclassifications are not replayed).
 */
async function computeSnapshot(base: Prisma.IncidentWhereInput, asOf: Date): Promise<ScoreSnapshot | null> {
  const candidates = await prisma.incident.findMany({
    where: and(base, { createdAt: { lte: asOf } }),
    select: { id: true, severity: true, createdAt: true },
    take: MAX_ROWS + 1,
  });

  // Nothing existed then, or too much to rebuild reliably: no comparison is better than a wrong one.
  if (candidates.length === 0 || candidates.length > MAX_ROWS) return null;

  const history = await prisma.incidentHistory.findMany({
    where: {
      incidentId: { in: candidates.map((c) => c.id) },
      createdAt: { lte: asOf },
      toStatus: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { incidentId: true, toStatus: true },
  });

  const statusAtSnapshot = new Map<string, IncidentStatus>();
  for (const row of history) {
    if (!statusAtSnapshot.has(row.incidentId) && row.toStatus) {
      statusAtSnapshot.set(row.incidentId, row.toStatus);
    }
  }

  const openBySeverity = emptySeverityCounts();
  let escalated = 0;
  let overdue = 0;

  for (const c of candidates) {
    const status = statusAtSnapshot.get(c.id) ?? IncidentStatus.NEW;
    if (CLOSED_STATUSES.includes(status)) continue;

    openBySeverity[c.severity]++;
    if (status === IncidentStatus.ESCALATED) escalated++;
    if (hoursBetween(c.createdAt, asOf) > RESOLUTION_TARGET_HOURS[c.severity]) overdue++;
  }

  const resolvedRows = await prisma.incident.findMany({
    where: and(base, {
      resolvedAt: { gte: new Date(asOf.getTime() - RESOLUTION_WINDOW_DAYS * DAY_MS), lte: asOf },
    }),
    select: { createdAt: true, resolvedAt: true, severity: true },
    take: MAX_ROWS,
  });
  const resolution = summariseResolution(resolvedRows, false);

  const inputs: HealthInputs = {
    openCritical: openBySeverity.CRITICAL,
    openHigh: openBySeverity.HIGH,
    escalated,
    overdue,
    resolvedCount: resolution.resolvedCount,
    resolvedWithinTarget: resolution.withinTargetCount,
  };

  return { asOf: asOf.toISOString(), openBySeverity, escalated, overdue, health: computeHealthScore(inputs) };
}

/**
 * Computes raw statistics directly from MySQL database.
 */
async function computeIncidentStats(user: AuthenticatedUser): Promise<IncidentStats> {
  const baseCondition = buildStatsScopeCondition(user);
  const now = new Date();
  const openCondition: Prisma.IncidentWhereInput = { status: { notIn: [...CLOSED_STATUSES] } };

  // 1. Group by status
  const statusGroups = await prisma.incident.groupBy({
    by: ["status"],
    where: baseCondition,
    _count: { _all: true },
  });

  const byStatus: Record<IncidentStatus, number> = {
    NEW: 0,
    TRIAGED: 0,
    ASSIGNED: 0,
    INVESTIGATING: 0,
    REMEDIATING: 0,
    VERIFYING: 0,
    RESOLVED: 0,
    CLOSED: 0,
    REJECTED: 0,
    REOPENED: 0,
    ESCALATED: 0,
  };

  for (const group of statusGroups) {
    byStatus[group.status] = group._count._all;
  }

  // 2. Group by severity (all statuses)
  const severityGroups = await prisma.incident.groupBy({
    by: ["severity"],
    where: baseCondition,
    _count: { _all: true },
  });

  const bySeverity = emptySeverityCounts();
  for (const group of severityGroups) {
    bySeverity[group.severity] = group._count._all;
  }

  // 3. Open incidents by severity
  const openGroups = await prisma.incident.groupBy({
    by: ["severity"],
    where: and(baseCondition, openCondition),
    _count: { _all: true },
  });
  const openBySeverity = emptySeverityCounts();
  for (const group of openGroups) {
    openBySeverity[group.severity] = group._count._all;
  }

  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  const open = Object.values(openBySeverity).reduce((sum, count) => sum + count, 0);

  // 4. Overdue: open longer than the target for their severity
  const overdueBySeverity = emptySeverityCounts();
  await Promise.all(
    SEVERITIES.map(async (severity) => {
      overdueBySeverity[severity] = await prisma.incident.count({
        where: and(baseCondition, openCondition, {
          severity,
          createdAt: { lt: new Date(now.getTime() - RESOLUTION_TARGET_HOURS[severity] * HOUR_MS) },
        }),
      });
    })
  );
  const overdueTotal = Object.values(overdueBySeverity).reduce((sum, count) => sum + count, 0);

  // 5. Resolution performance over the last 30 days
  const resolvedRows = await prisma.incident.findMany({
    where: and(baseCondition, {
      resolvedAt: { gte: new Date(now.getTime() - RESOLUTION_WINDOW_DAYS * DAY_MS) },
    }),
    select: { createdAt: true, resolvedAt: true, severity: true },
    take: MAX_ROWS + 1,
  });
  const resolutionTruncated = resolvedRows.length > MAX_ROWS;
  const resolution = summariseResolution(resolvedRows.slice(0, MAX_ROWS), resolutionTruncated);

  // 6. Health score and its seven-day-old counterpart
  const health = computeHealthScore({
    openCritical: openBySeverity.CRITICAL,
    openHigh: openBySeverity.HIGH,
    escalated: byStatus.ESCALATED,
    overdue: overdueTotal,
    resolvedCount: resolution.resolvedCount,
    resolvedWithinTarget: resolution.withinTargetCount,
  });
  const previous = await computeSnapshot(baseCondition, new Date(now.getTime() - PREVIOUS_PERIOD_DAYS * DAY_MS));

  // 7. Daily incident trends (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const recentIncidents = await prisma.incident.findMany({
    where: {
      ...baseCondition,
      createdAt: { gte: sevenDaysAgo },
    },
    select: { createdAt: true },
  });

  const trendMap = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split("T")[0]!;
    trendMap.set(key, 0);
  }

  for (const item of recentIncidents) {
    const key = item.createdAt.toISOString().split("T")[0]!;
    if (trendMap.has(key)) {
      trendMap.set(key, (trendMap.get(key) || 0) + 1);
    }
  }

  const trends = Array.from(trendMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  // 8. Incident intake over the last 24 hours in 30-minute buckets, for the activity monitor
  const bucketMs = ACTIVITY_BUCKET_MINUTES * 60 * 1000;
  const bucketCount = (ACTIVITY_WINDOW_HOURS * 60) / ACTIVITY_BUCKET_MINUTES;
  const currentBucketStart = Math.floor(now.getTime() / bucketMs) * bucketMs;
  const windowStart = currentBucketStart - (bucketCount - 1) * bucketMs;

  const activityRows = await prisma.incident.findMany({
    where: and(baseCondition, { createdAt: { gte: new Date(windowStart) } }),
    select: { createdAt: true, severity: true },
    take: MAX_ROWS + 1,
  });

  const buckets: ActivityBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    start: new Date(windowStart + i * bucketMs).toISOString(),
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  }));
  for (const row of activityRows.slice(0, MAX_ROWS)) {
    const index = Math.floor((row.createdAt.getTime() - windowStart) / bucketMs);
    const bucket = buckets[index];
    if (bucket) bucket[row.severity]++;
  }

  return {
    total,
    open,
    critical: openBySeverity.CRITICAL,
    bySeverity,
    byStatus,
    trends,
    scope: getStatsScope(user),
    generatedAt: now.toISOString(),
    openBySeverity,
    escalated: byStatus.ESCALATED,
    overdue: { total: overdueTotal, bySeverity: overdueBySeverity },
    resolution,
    health,
    previous,
    activity: {
      windowHours: ACTIVITY_WINDOW_HOURS,
      bucketMinutes: ACTIVITY_BUCKET_MINUTES,
      truncated: activityRows.length > MAX_ROWS,
      buckets,
    },
  };
}

/**
 * Retrieves dashboard statistics with cache-aside and stampede protection.
 */
export async function getIncidentStatistics(user: AuthenticatedUser): Promise<IncidentStats> {
  const cacheKey = getStatsCacheKey(user);

  return getOrSet(
    cacheKey,
    () => computeIncidentStats(user),
    STATS_CACHE_TTL_SECONDS
  );
}
