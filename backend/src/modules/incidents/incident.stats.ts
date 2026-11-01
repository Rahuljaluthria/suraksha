import { prisma } from "../../config/prisma.js";
import { getOrSet } from "../../services/cache.service.js";
import type { AuthenticatedUser } from "../../middleware/auth.js";
import { ForbiddenOperationError } from "./incident.service.js";
import { Prisma, IncidentStatus, IncidentSeverity } from "../../generated/prisma/client.js";

export interface IncidentStats {
  total: number;
  open: number;
  critical: number;
  bySeverity: Record<IncidentSeverity, number>;
  byStatus: Record<IncidentStatus, number>;
  trends: Array<{ date: string; count: number }>;
}

const STATS_CACHE_TTL_SECONDS = 60;

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

export function getStatsCacheKey(user: AuthenticatedUser): string {
  const hasUniversalRead = user.hasPermission("incident:read:all");
  const scope = hasUniversalRead ? "all" : `user:${user.id}`;
  return `incident:stats:${scope}`;
}

/**
 * Computes raw statistics directly from MySQL database.
 */
async function computeIncidentStats(user: AuthenticatedUser): Promise<IncidentStats> {
  const baseCondition = buildStatsScopeCondition(user);

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

  // 2. Group by severity
  const severityGroups = await prisma.incident.groupBy({
    by: ["severity"],
    where: baseCondition,
    _count: { _all: true },
  });

  const bySeverity: Record<IncidentSeverity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };

  for (const group of severityGroups) {
    bySeverity[group.severity] = group._count._all;
  }

  // 3. Aggregate totals
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  const closedStatuses: readonly IncidentStatus[] = [IncidentStatus.RESOLVED, IncidentStatus.CLOSED, IncidentStatus.REJECTED];
  const open = Object.entries(byStatus).reduce((sum, [status, count]) => {
    return closedStatuses.includes(status as IncidentStatus) ? sum : sum + count;
  }, 0);

  const critical = await prisma.incident.count({
    where: {
      ...baseCondition,
      severity: IncidentSeverity.CRITICAL,
      status: { notIn: [IncidentStatus.CLOSED, IncidentStatus.REJECTED] },
    },
  });

  // 4. Daily incident trends (last 7 days)
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

  return {
    total,
    open,
    critical,
    bySeverity,
    byStatus,
    trends,
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
