import type { IncidentSeverity } from "@/types/incident";

export interface AiStatus {
  available: boolean;
  features: {
    draftReport: boolean;
    analyze: boolean;
    recommend: boolean;
  };
}

export type AiIndicatorType =
  | "IP_ADDRESS"
  | "DOMAIN"
  | "URL"
  | "FILE_HASH"
  | "FILE_NAME"
  | "EMAIL_ADDRESS"
  | "PROCESS"
  | "ACCOUNT"
  | "BEHAVIOUR"
  | "OTHER";

export interface ReportDraft {
  title: string;
  summary: string;
  category: string;
  description: string;
  affectedAssets: Array<{ name: string; sourceQuote: string }>;
  observedIndicators: Array<{ indicator: string; type: AiIndicatorType; sourceQuote: string }>;
  suggestedSeverity: { level: IncidentSeverity; rationale: string };
  missingInformation: Array<{ field: string; question: string; source: "AI" | "SYSTEM" }>;
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

export type AiConfidence = "LOW" | "MEDIUM" | "HIGH";
export type AiAnalysisSource = "METADATA" | "DESCRIPTION" | "HISTORY" | "INVESTIGATION";
export type AiHypothesisCategory = "ATTACK_VECTOR" | "ROOT_CAUSE" | "IMPACT" | "OTHER";

export interface IncidentAnalysis {
  summary: string;
  /** Quoted from the incident record and verified by the server. */
  observedFacts: Array<{
    id: string;
    statement: string;
    source: AiAnalysisSource;
    sourceQuote: string;
  }>;
  indicators: Array<{ indicator: string; type: AiIndicatorType; sourceQuote: string }>;
  /** Inferences, never facts. */
  hypotheses: Array<{
    id: string;
    category: AiHypothesisCategory;
    statement: string;
    confidence: AiConfidence;
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
    incidentUpdatedAt: string;
    historyEntriesConsidered: number;
    hasInvestigation: boolean;
    notice: string;
  };
}

export type AiRemediationPriority = "P1" | "P2" | "P3" | "P4";
export type AiRemediationPhase =
  | "INVESTIGATION"
  | "CONTAINMENT"
  | "ERADICATION"
  | "RECOVERY"
  | "COMMUNICATION"
  | "PREVENTION"
  | "OTHER";
export type AiRiskFlag = "EVIDENCE_LOSS" | "DESTRUCTIVE" | "SERVICE_DISRUPTION" | "CONTAINS_COMMAND";

export interface RemediationRecommendation {
  id: string;
  action: string;
  priority: AiRemediationPriority;
  priorityNote: string | null;
  phase: AiRemediationPhase;
  rationale: string;
  evidenceQuote: string | null;
  evidenceVerified: boolean;
  targetAssets: string[];
  expectedOutcome: string;
  verification: string;
  risks: string;
  riskFlags: AiRiskFlag[];
  unverifiedDetails: string[];
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
