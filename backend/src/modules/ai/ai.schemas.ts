import { z } from "zod";

/** Keep in sync with INCIDENT_CATEGORIES in frontend/src/features/incidents/incidentConstants.ts */
export const INCIDENT_CATEGORIES = [
  "PHISHING",
  "MALWARE",
  "DATA_LEAK",
  "UNAUTHORIZED_ACCESS",
  "RANSOMWARE",
  "DOS",
  "SUSPICIOUS_ACTIVITY",
  "CREDENTIAL_COMPROMISE",
  "POLICY_VIOLATION",
  "OTHER",
] as const;

export const SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const INDICATOR_TYPES = [
  "IP_ADDRESS",
  "DOMAIN",
  "URL",
  "FILE_HASH",
  "FILE_NAME",
  "EMAIL_ADDRESS",
  "PROCESS",
  "ACCOUNT",
  "BEHAVIOUR",
  "OTHER",
] as const;

// ---------------------------------------------------------------------------
// Feature 1: AI incident report generator
// ---------------------------------------------------------------------------

export const reportDraftRequestSchema = z.object({
  description: z
    .string()
    .trim()
    .min(20, "Please describe what happened in at least 20 characters")
    .max(5000, "Description cannot exceed 5,000 characters"),
});

const normalizedEnum = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/[\s-]+/g, "_") : v),
    z.enum(values).catch(fallback)
  );

/** What the model must return. Anything else is rejected and repaired or failed. */
export const reportDraftModelSchema = z.object({
  title: z.string().trim().min(3).max(255),
  summary: z.string().trim().min(1).max(1000),
  category: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/[\s-]+/g, "_") : v),
    z.enum(INCIDENT_CATEGORIES)
  ),
  description: z.string().trim().min(1).max(4000),
  affectedAssets: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        sourceQuote: z.string().trim().min(1).max(500),
      })
    )
    .max(20),
  observedIndicators: z
    .array(
      z.object({
        indicator: z.string().trim().min(1).max(300),
        type: normalizedEnum(INDICATOR_TYPES, "OTHER"),
        sourceQuote: z.string().trim().min(1).max(500),
      })
    )
    .max(30),
  suggestedSeverity: z.object({
    level: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
      z.enum(SEVERITY_LEVELS)
    ),
    rationale: z.string().trim().min(1).max(500),
  }),
  missingInformation: z
    .array(
      z.object({
        field: z.string().trim().min(1).max(100),
        question: z.string().trim().min(1).max(300),
      })
    )
    .max(15),
});

export type ReportDraftModelOutput = z.infer<typeof reportDraftModelSchema>;

export type MissingInformationSource = "AI" | "SYSTEM";

/** What the API returns to the client after grounding, restoration and warnings. */
export interface ReportDraft {
  title: string;
  summary: string;
  category: (typeof INCIDENT_CATEGORIES)[number];
  description: string;
  affectedAssets: Array<{ name: string; sourceQuote: string }>;
  observedIndicators: Array<{
    indicator: string;
    type: (typeof INDICATOR_TYPES)[number];
    sourceQuote: string;
  }>;
  suggestedSeverity: { level: (typeof SEVERITY_LEVELS)[number]; rationale: string };
  missingInformation: Array<{ field: string; question: string; source: MissingInformationSource }>;
}

export interface ReportDraftResponse {
  draft: ReportDraft;
  warnings: string[];
  meta: {
    advisory: true;
    model: string;
    promptVersion: string;
    generatedAt: string;
    maskedValueCount: number;
    notice: string;
  };
}

export type ReportDraftRequest = z.infer<typeof reportDraftRequestSchema>;

// ---------------------------------------------------------------------------
// Feature 2: AI incident analysis
// ---------------------------------------------------------------------------

export const ANALYSIS_SOURCES = ["METADATA", "DESCRIPTION", "HISTORY", "INVESTIGATION"] as const;
export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const HYPOTHESIS_CATEGORIES = ["ATTACK_VECTOR", "ROOT_CAUSE", "IMPACT", "OTHER"] as const;

const upperEnum = <T extends readonly [string, ...string[]]>(values: T, fallback?: T[number]) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/[\s-]+/g, "_") : v),
    fallback === undefined ? z.enum(values) : z.enum(values).catch(fallback)
  );

const factIdList = z.array(z.string().trim().min(1).max(12)).max(12).default([]);

export const analysisModelSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  observedFacts: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(12),
        statement: z.string().trim().min(1).max(500),
        source: upperEnum(ANALYSIS_SOURCES, "DESCRIPTION"),
        sourceQuote: z.string().trim().min(1).max(600),
      })
    )
    .max(30),
  indicators: z
    .array(
      z.object({
        indicator: z.string().trim().min(1).max(300),
        type: upperEnum(INDICATOR_TYPES, "OTHER"),
        sourceQuote: z.string().trim().min(1).max(600),
      })
    )
    .max(30),
  hypotheses: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(12),
        category: upperEnum(HYPOTHESIS_CATEGORIES, "OTHER"),
        statement: z.string().trim().min(1).max(600),
        confidence: upperEnum(CONFIDENCE_LEVELS),
        reasoning: z.string().trim().min(1).max(1000),
        supportingFactIds: factIdList,
        howToVerify: z.string().trim().max(500).default(""),
      })
    )
    .max(15),
  suspiciousPatterns: z
    .array(
      z.object({
        pattern: z.string().trim().min(1).max(300),
        explanation: z.string().trim().min(1).max(700),
        supportingFactIds: factIdList,
      })
    )
    .max(12),
  missingEvidence: z
    .array(
      z.object({
        item: z.string().trim().min(1).max(300),
        whyItMatters: z.string().trim().max(500).default(""),
      })
    )
    .max(20),
});

export type AnalysisModelOutput = z.infer<typeof analysisModelSchema>;
export type AnalysisSource = (typeof ANALYSIS_SOURCES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export interface IncidentAnalysis {
  summary: string;
  /** Quoted from the incident record. Verified server-side against the supplied text. */
  observedFacts: Array<{ id: string; statement: string; source: AnalysisSource; sourceQuote: string }>;
  indicators: Array<{ indicator: string; type: (typeof INDICATOR_TYPES)[number]; sourceQuote: string }>;
  /** Inferences, not facts. Confidence is capped by the server when support is thin. */
  hypotheses: Array<{
    id: string;
    category: (typeof HYPOTHESIS_CATEGORIES)[number];
    statement: string;
    confidence: ConfidenceLevel;
    confidenceNote: string | null;
    reasoning: string;
    supportingFactIds: string[];
    howToVerify: string;
  }>;
  suspiciousPatterns: Array<{ pattern: string; explanation: string; supportingFactIds: string[] }>;
  missingEvidence: Array<{ item: string; whyItMatters: string }>;
}

export interface IncidentAnalysisResponse {
  incident: { id: string; incidentNumber: string };
  analysis: IncidentAnalysis;
  warnings: string[];
  meta: {
    advisory: true;
    model: string;
    promptVersion: string;
    generatedAt: string;
    /** updatedAt of the incident when it was analysed, so the UI can detect staleness. */
    incidentUpdatedAt: string;
    historyEntriesConsidered: number;
    hasInvestigation: boolean;
    notice: string;
  };
}

// ---------------------------------------------------------------------------
// Feature 3: AI remediation suggestions
// ---------------------------------------------------------------------------

export const REMEDIATION_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export const REMEDIATION_PHASES = [
  "INVESTIGATION",
  "CONTAINMENT",
  "ERADICATION",
  "RECOVERY",
  "COMMUNICATION",
  "PREVENTION",
  "OTHER",
] as const;

export type RemediationPriority = (typeof REMEDIATION_PRIORITIES)[number];
export type RemediationPhase = (typeof REMEDIATION_PHASES)[number];
export type RiskFlag = "EVIDENCE_LOSS" | "DESTRUCTIVE" | "SERVICE_DISRUPTION" | "CONTAINS_COMMAND";

export const remediationModelSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  recommendations: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(12),
        action: z.string().trim().min(1).max(500),
        priority: upperEnum(REMEDIATION_PRIORITIES),
        phase: upperEnum(REMEDIATION_PHASES, "OTHER"),
        rationale: z.string().trim().min(1).max(800),
        sourceQuote: z.string().trim().max(600).default(""),
        targetAssets: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
        expectedOutcome: z.string().trim().min(1).max(500),
        verification: z.string().trim().min(1).max(600),
        risks: z.string().trim().max(500).default(""),
        // Accepted for compatibility with the prompt; the server always sets it to true.
        requiresApproval: z.boolean().optional(),
      })
    )
    .max(12),
  assumptions: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  informationNeeded: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
});

export type RemediationModelOutput = z.infer<typeof remediationModelSchema>;

export interface RemediationRecommendation {
  id: string;
  action: string;
  priority: RemediationPriority;
  /** Set when the server lowered the AI's priority; null otherwise. */
  priorityNote: string | null;
  phase: RemediationPhase;
  rationale: string;
  /** Verbatim record text behind the rationale, or null when it could not be verified. */
  evidenceQuote: string | null;
  evidenceVerified: boolean;
  targetAssets: string[];
  expectedOutcome: string;
  verification: string;
  risks: string;
  riskFlags: RiskFlag[];
  /** Concrete specifics (IPs, hashes, URLs, CVEs) in this recommendation that are not in the record. */
  unverifiedDetails: string[];
  /** Always true: nothing here is executed or applied without a human deciding to act. */
  requiresApproval: true;
}

export interface RemediationPlanResponse {
  incident: { id: string; incidentNumber: string; severity: string; status: string };
  plan: {
    summary: string;
    recommendations: RemediationRecommendation[];
    assumptions: string[];
    informationNeeded: string[];
  };
  warnings: string[];
  meta: {
    advisory: true;
    requiresHumanApproval: true;
    model: string;
    promptVersion: string;
    generatedAt: string;
    incidentUpdatedAt: string;
    notice: string;
  };
}
