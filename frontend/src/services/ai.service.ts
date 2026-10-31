import axios from "axios";
import { api } from "./api";
import type { ApiErrorResponse } from "@/types/auth";
import type {
  AiStatus,
  IncidentAnalysisResponse,
  RemediationPlanResponse,
  ReportDraftResponse,
} from "@/types/ai";

// AI calls can take longer than ordinary API calls (provider latency plus one retry).
const AI_REQUEST_TIMEOUT_MS = 70_000;

export const aiService = {
  /**
   * Whether AI is available on this deployment and which AI features the user may use.
   */
  async getStatus(): Promise<AiStatus> {
    const response = await api.get<{ success: boolean; data: AiStatus }>("/ai/status");
    return response.data.data;
  },

  /**
   * Turns a free-text description into a structured, reviewable report draft.
   * Nothing is saved: the draft only reaches the incident registry when the user submits the form.
   */
  async draftReport(description: string): Promise<ReportDraftResponse> {
    const response = await api.post<{ success: boolean; data: ReportDraftResponse }>(
      "/ai/report-draft",
      { description },
      { timeout: AI_REQUEST_TIMEOUT_MS }
    );
    return response.data.data;
  },

  /**
   * Analyses an incident the user can already read. Nothing is saved; the result is advisory.
   */
  async analyzeIncident(incidentId: string): Promise<IncidentAnalysisResponse> {
    const response = await api.post<{ success: boolean; data: IncidentAnalysisResponse }>(
      `/ai/incidents/${encodeURIComponent(incidentId)}/analysis`,
      {},
      { timeout: AI_REQUEST_TIMEOUT_MS }
    );
    return response.data.data;
  },

  /**
   * Asks for remediation suggestions for an incident the user can already read.
   * Suggestions only: nothing is executed, saved or applied by Suraksha.
   */
  async recommendRemediation(incidentId: string): Promise<RemediationPlanResponse> {
    const response = await api.post<{ success: boolean; data: RemediationPlanResponse }>(
      `/ai/incidents/${encodeURIComponent(incidentId)}/remediation`,
      {},
      { timeout: AI_REQUEST_TIMEOUT_MS }
    );
    return response.data.data;
  },
};

/** Turns any failure from an AI call into a message that is safe and useful to show. */
export function getAiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (error.code === "ECONNABORTED") {
      return "The AI service took too long to respond. Please try again.";
    }
    const data = error.response?.data;
    if (data?.errors?.length) return data.errors[0]!.message;
    if (data?.message) return data.message;
  }
  return "AI drafting failed. Please try again or fill in the form manually.";
}
