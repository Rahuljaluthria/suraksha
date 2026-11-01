import type { IncidentSeverity, IncidentStatus } from "@/types/incident";

export type HealthBand = "HEALTHY" | "ELEVATED" | "CRITICAL";

export interface HealthComponent {
  key: "openCritical" | "openHigh" | "escalated" | "overdue" | "resolutionPerformance";
  label: string;
  count: number;
  pointsEach: number | null;
  maxPoints: number;
  deduction: number;
  note: string | null;
}

export interface HealthScore {
  score: number;
  band: HealthBand;
  components: HealthComponent[];
}

export type SeverityCounts = Record<IncidentSeverity, number>;

export interface ScoreSnapshot {
  asOf: string;
  openBySeverity: SeverityCounts;
  escalated: number;
  overdue: number;
  health: HealthScore;
}

export interface IncidentActivityBucket extends SeverityCounts {
  start: string;
}

export interface IncidentStats {
  total: number;
  open: number;
  critical: number;
  bySeverity: SeverityCounts;
  byStatus: Record<IncidentStatus, number>;
  trends: Array<{ date: string; count: number }>;
  scope: "all" | "assigned" | "own" | "assigned_and_own";
  generatedAt: string;
  openBySeverity: SeverityCounts;
  escalated: number;
  overdue: { total: number; bySeverity: SeverityCounts };
  resolution: {
    windowDays: number;
    resolvedCount: number;
    meanHours: number | null;
    withinTargetCount: number;
    withinTargetPct: number | null;
    truncated: boolean;
  };
  health: HealthScore;
  previous: ScoreSnapshot | null;
  activity: {
    windowHours: number;
    bucketMinutes: number;
    truncated: boolean;
    buckets: IncidentActivityBucket[];
  };
}

export type ServiceStatus = "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";
export type OverallStatus = "OPERATIONAL" | "DEGRADED" | "DOWN";

export interface ServiceHealth {
  key: "database" | "redis" | "kafka" | "eventPipeline" | "worker";
  label: string;
  status: ServiceStatus;
  latencyMs: number | null;
  detail: string | null;
}

export interface SystemHealth {
  overall: OverallStatus;
  checkedAt: string;
  uptimeSeconds: number;
  services: ServiceHealth[];
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsPayload {
  items: NotificationItem[];
  unreadCount: number;
}

export type ActivityCategory =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "ACCOUNT_LOCKED"
  | "ACCESS_DENIED"
  | "TOKEN_REUSE";

export type SignalType =
  | "TOKEN_REUSE"
  | "ACCOUNT_LOCKED"
  | "FAILED_LOGIN_BURST"
  | "ACCESS_DENIED_BURST"
  | "LOGIN_SURGE";

export interface ActivitySignal {
  type: SignalType;
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
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
