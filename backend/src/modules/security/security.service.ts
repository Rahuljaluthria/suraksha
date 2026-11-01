import { prisma } from "../../config/prisma.js";

export const ACTIVITY_CATEGORIES = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "ACCOUNT_LOCKED",
  "ACCESS_DENIED",
  "TOKEN_REUSE",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Audit actions that feed each category. Anything else in the audit log is ignored here. */
const ACTION_TO_CATEGORY: Record<string, ActivityCategory> = {
  AUTH_LOGIN_SUCCESS: "LOGIN_SUCCESS",
  AUTH_LOGIN_FAILED: "LOGIN_FAILED",
  AUTH_ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  AUTHZ_FORBIDDEN_ROLE: "ACCESS_DENIED",
  AUTHZ_FORBIDDEN_PERMISSION: "ACCESS_DENIED",
  AUTH_REFRESH_TOKEN_REUSE_DETECTED: "TOKEN_REUSE",
};

export type SignalType =
  | "TOKEN_REUSE"
  | "ACCOUNT_LOCKED"
  | "FAILED_LOGIN_BURST"
  | "ACCESS_DENIED_BURST"
  | "LOGIN_SURGE";
export type SignalSeverity = "MEDIUM" | "HIGH" | "CRITICAL";

export interface ActivitySignal {
  type: SignalType;
  severity: SignalSeverity;
}

export interface SecurityActivityBucket {
  start: string;
  counts: Record<ActivityCategory, number>;
  signals: ActivitySignal[];
}

export interface SecurityActivity {
  windowHours: number;
  bucketSeconds: number;
  generatedAt: string;
  truncated: boolean;
  totals: Record<ActivityCategory, number>;
  buckets: SecurityActivityBucket[];
}

/** Thresholds are deliberately simple and visible: no hidden anomaly model. */
export const SIGNAL_THRESHOLDS = {
  failedLoginBurst: 5, // matches the default account lockout threshold
  accessDeniedBurst: 5,
  loginSurgeMin: 10,
  loginSurgeMedianMultiple: 3,
} as const;

const BUCKET_COUNT = 48;
const MAX_ROWS = 20_000;

const emptyCounts = (): Record<ActivityCategory, number> => ({
  LOGIN_SUCCESS: 0,
  LOGIN_FAILED: 0,
  ACCOUNT_LOCKED: 0,
  ACCESS_DENIED: 0,
  TOKEN_REUSE: 0,
});

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Pure: turns per-bucket counts into labelled signals. Exported for tests. */
export function detectSignals(counts: Record<ActivityCategory, number>, successMedian: number): ActivitySignal[] {
  const signals: ActivitySignal[] = [];
  if (counts.TOKEN_REUSE > 0) signals.push({ type: "TOKEN_REUSE", severity: "CRITICAL" });
  if (counts.ACCOUNT_LOCKED > 0) signals.push({ type: "ACCOUNT_LOCKED", severity: "HIGH" });
  if (counts.LOGIN_FAILED >= SIGNAL_THRESHOLDS.failedLoginBurst) {
    signals.push({ type: "FAILED_LOGIN_BURST", severity: "HIGH" });
  }
  if (counts.ACCESS_DENIED >= SIGNAL_THRESHOLDS.accessDeniedBurst) {
    signals.push({ type: "ACCESS_DENIED_BURST", severity: "MEDIUM" });
  }
  const surgeThreshold = Math.max(
    SIGNAL_THRESHOLDS.loginSurgeMin,
    successMedian * SIGNAL_THRESHOLDS.loginSurgeMedianMultiple
  );
  if (counts.LOGIN_SUCCESS >= surgeThreshold) signals.push({ type: "LOGIN_SURGE", severity: "MEDIUM" });
  return signals;
}

/** Pure bucketing, separate from the query so it can be tested with fixed timestamps. */
export function bucketActivity(
  rows: Array<{ createdAt: Date; action: string }>,
  windowStartMs: number,
  bucketMs: number
): SecurityActivityBucket[] {
  const buckets = Array.from({ length: BUCKET_COUNT }, (_, i) => ({
    start: new Date(windowStartMs + i * bucketMs).toISOString(),
    counts: emptyCounts(),
    signals: [] as ActivitySignal[],
  }));

  for (const row of rows) {
    const category = ACTION_TO_CATEGORY[row.action];
    if (!category) continue;
    const index = Math.floor((row.createdAt.getTime() - windowStartMs) / bucketMs);
    const bucket = buckets[index];
    if (bucket) bucket.counts[category]++;
  }

  const successMedian = median(buckets.map((b) => b.counts.LOGIN_SUCCESS));
  for (const bucket of buckets) bucket.signals = detectSignals(bucket.counts, successMedian);
  return buckets;
}

export async function getSecurityActivity(windowHours: number, now = new Date()): Promise<SecurityActivity> {
  const bucketMs = (windowHours * 60 * 60 * 1000) / BUCKET_COUNT;
  const currentBucketStart = Math.floor(now.getTime() / bucketMs) * bucketMs;
  const windowStartMs = currentBucketStart - (BUCKET_COUNT - 1) * bucketMs;

  const rows = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: new Date(windowStartMs) },
      action: { in: Object.keys(ACTION_TO_CATEGORY) },
    },
    select: { createdAt: true, action: true },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS + 1,
  });

  const truncated = rows.length > MAX_ROWS;
  const buckets = bucketActivity(rows.slice(0, MAX_ROWS), windowStartMs, bucketMs);

  const totals = emptyCounts();
  for (const bucket of buckets) {
    for (const category of ACTIVITY_CATEGORIES) totals[category] += bucket.counts[category];
  }

  return {
    windowHours,
    bucketSeconds: Math.round(bucketMs / 1000),
    generatedAt: now.toISOString(),
    truncated,
    totals,
    buckets,
  };
}
