/**
 * Incident Health Score: a transparent 0-100 indicator of how well the incident queue is
 * being handled. It is a plain deduction model, not a prediction, so every point can be
 * traced to a count the user can inspect.
 *
 *   score = 100 - sum(deductions), floored at 0
 *
 *   open critical incidents ........ 15 points each (max 45)
 *   open high incidents ............. 6 points each (max 24)
 *   escalated, unresolved ........... 5 points each (max 15)
 *   overdue incidents ............... 3 points each (max 12)
 *   resolution performance .......... up to 10 points, scaled by the share of incidents
 *                                     resolved late over the last 30 days (needs 3+ resolved)
 *
 *   Bands: 80-100 HEALTHY, 50-79 ELEVATED, 0-49 CRITICAL.
 *
 * "Overdue" means an open incident older than its severity's resolution target
 * (see RESOLUTION_TARGET_HOURS). Suraksha has no per-incident SLA field, so these
 * targets are an explicit, adjustable assumption rather than a customer commitment.
 */

export type HealthBand = "HEALTHY" | "ELEVATED" | "CRITICAL";

export const RESOLUTION_TARGET_HOURS = {
  CRITICAL: 24,
  HIGH: 72,
  MEDIUM: 168,
  LOW: 336,
} as const;

export const MIN_RESOLVED_FOR_PERFORMANCE = 3;

export interface HealthInputs {
  openCritical: number;
  openHigh: number;
  escalated: number;
  overdue: number;
  resolvedCount: number;
  resolvedWithinTarget: number;
}

export interface HealthComponent {
  key: "openCritical" | "openHigh" | "escalated" | "overdue" | "resolutionPerformance";
  label: string;
  /** The count the deduction is based on (for resolution performance: incidents resolved late). */
  count: number;
  /** Points removed per counted item (null when the deduction is scaled instead). */
  pointsEach: number | null;
  maxPoints: number;
  deduction: number;
  note: string | null;
}

export interface HealthScore {
  score: number;
  band: HealthBand;
  components: HealthComponent[];
  inputs: HealthInputs;
}

const clampDeduction = (count: number, each: number, max: number) => Math.min(count * each, max);

export function bandForScore(score: number): HealthBand {
  if (score >= 80) return "HEALTHY";
  if (score >= 50) return "ELEVATED";
  return "CRITICAL";
}

export function computeHealthScore(inputs: HealthInputs): HealthScore {
  const lateCount = Math.max(0, inputs.resolvedCount - inputs.resolvedWithinTarget);
  const hasPerformanceData = inputs.resolvedCount >= MIN_RESOLVED_FOR_PERFORMANCE;
  const performanceDeduction = hasPerformanceData
    ? Math.round((lateCount / inputs.resolvedCount) * 10)
    : 0;

  const components: HealthComponent[] = [
    {
      key: "openCritical",
      label: "Open critical incidents",
      count: inputs.openCritical,
      pointsEach: 15,
      maxPoints: 45,
      deduction: clampDeduction(inputs.openCritical, 15, 45),
      note: null,
    },
    {
      key: "openHigh",
      label: "Open high-severity incidents",
      count: inputs.openHigh,
      pointsEach: 6,
      maxPoints: 24,
      deduction: clampDeduction(inputs.openHigh, 6, 24),
      note: null,
    },
    {
      key: "escalated",
      label: "Unresolved escalations",
      count: inputs.escalated,
      pointsEach: 5,
      maxPoints: 15,
      deduction: clampDeduction(inputs.escalated, 5, 15),
      note: null,
    },
    {
      key: "overdue",
      label: "Overdue incidents",
      count: inputs.overdue,
      pointsEach: 3,
      maxPoints: 12,
      deduction: clampDeduction(inputs.overdue, 3, 12),
      note: `Open longer than the target: ${Object.entries(RESOLUTION_TARGET_HOURS)
        .map(([sev, hours]) => `${sev.toLowerCase()} ${hours}h`)
        .join(", ")}`,
    },
    {
      key: "resolutionPerformance",
      label: "Resolution performance (30 days)",
      count: lateCount,
      pointsEach: null,
      maxPoints: 10,
      deduction: performanceDeduction,
      note: hasPerformanceData
        ? `${inputs.resolvedWithinTarget} of ${inputs.resolvedCount} resolved within target`
        : `Needs at least ${MIN_RESOLVED_FOR_PERFORMANCE} resolved incidents; not counted yet`,
    },
  ];

  const totalDeduction = components.reduce((sum, c) => sum + c.deduction, 0);
  const score = Math.max(0, Math.min(100, 100 - totalDeduction));

  return { score, band: bandForScore(score), components, inputs };
}
