import type { ActivityCategory, IncidentStats, SecurityActivity, SignalType } from "@/types/dashboard";

export type WaveSeverity = "NONE" | "MEDIUM" | "HIGH" | "CRITICAL";
export type WaveMode = "security" | "incidents";

export interface WavePoint {
  /** Bucket start, epoch ms. */
  ts: number;
  /** Bucket length in ms. */
  span: number;
  /** Weighted activity level that drives the line. */
  amplitude: number;
  /** Worst signal in this bucket; NONE when the bucket looks ordinary. */
  severity: WaveSeverity;
  /** Raw counts shown in the tooltip. */
  counts: Array<{ label: string; value: number }>;
  signals: SignalType[];
  total: number;
}

/**
 * Weights decide how tall each kind of event makes the line. They are fixed and shown in the
 * legend, so a spike always has a readable cause: a routine login barely moves the line, a
 * token-reuse alert dominates it.
 */
export const SECURITY_WEIGHTS: Record<ActivityCategory, number> = {
  LOGIN_SUCCESS: 0.25,
  LOGIN_FAILED: 1,
  ACCESS_DENIED: 1.5,
  ACCOUNT_LOCKED: 3,
  TOKEN_REUSE: 5,
};

export const SECURITY_LABELS: Record<ActivityCategory, string> = {
  LOGIN_SUCCESS: "Successful logins",
  LOGIN_FAILED: "Failed logins",
  ACCESS_DENIED: "Access denials",
  ACCOUNT_LOCKED: "Account lockouts",
  TOKEN_REUSE: "Token reuse alerts",
};

export const INCIDENT_WEIGHTS = { LOW: 1, MEDIUM: 2, HIGH: 4, CRITICAL: 8 } as const;

export const SIGNAL_LABELS: Record<SignalType, string> = {
  TOKEN_REUSE: "Refresh token reuse detected",
  ACCOUNT_LOCKED: "Account locked after failed attempts",
  FAILED_LOGIN_BURST: "Burst of failed logins",
  ACCESS_DENIED_BURST: "Burst of access denials",
  LOGIN_SURGE: "Unusual login volume",
};

const RANK: Record<WaveSeverity, number> = { NONE: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function buildSecurityWave(activity: SecurityActivity): WavePoint[] {
  const span = activity.bucketSeconds * 1000;
  return activity.buckets.map((bucket) => {
    const amplitude = (Object.keys(SECURITY_WEIGHTS) as ActivityCategory[]).reduce(
      (sum, category) => sum + bucket.counts[category] * SECURITY_WEIGHTS[category],
      0
    );
    const severity = bucket.signals.reduce<WaveSeverity>(
      (worst, s) => (RANK[s.severity] > RANK[worst] ? s.severity : worst),
      "NONE"
    );
    const counts = (Object.keys(SECURITY_LABELS) as ActivityCategory[]).map((category) => ({
      label: SECURITY_LABELS[category],
      value: bucket.counts[category],
    }));
    return {
      ts: new Date(bucket.start).getTime(),
      span,
      amplitude: Number(amplitude.toFixed(2)),
      severity,
      counts,
      signals: bucket.signals.map((s) => s.type),
      total: counts.reduce((sum, c) => sum + c.value, 0),
    };
  });
}

/** Incident intake: CRITICAL and HIGH buckets carry a marker; lower severities only lift the line. */
export function buildIncidentWave(stats: IncidentStats): WavePoint[] {
  const span = stats.activity.bucketMinutes * 60_000;
  return stats.activity.buckets.map((bucket) => {
    const amplitude =
      bucket.LOW * INCIDENT_WEIGHTS.LOW +
      bucket.MEDIUM * INCIDENT_WEIGHTS.MEDIUM +
      bucket.HIGH * INCIDENT_WEIGHTS.HIGH +
      bucket.CRITICAL * INCIDENT_WEIGHTS.CRITICAL;
    const severity: WaveSeverity = bucket.CRITICAL > 0 ? "CRITICAL" : bucket.HIGH > 0 ? "HIGH" : "NONE";
    const counts = [
      { label: "Critical incidents", value: bucket.CRITICAL },
      { label: "High incidents", value: bucket.HIGH },
      { label: "Medium incidents", value: bucket.MEDIUM },
      { label: "Low incidents", value: bucket.LOW },
    ];
    return {
      ts: new Date(bucket.start).getTime(),
      span,
      amplitude,
      severity,
      counts,
      signals: [],
      total: counts.reduce((sum, c) => sum + c.value, 0),
    };
  });
}

/** The most recent bucket (within `lookback`) that carries a CRITICAL marker, if any. */
export function latestCritical(points: WavePoint[], lookback = 6): WavePoint | null {
  for (let i = points.length - 1; i >= Math.max(0, points.length - lookback); i--) {
    if (points[i]!.severity === "CRITICAL") return points[i]!;
  }
  return null;
}
