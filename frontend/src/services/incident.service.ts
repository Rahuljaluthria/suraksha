import { api } from "./api";
import type {
  IncidentItem,
  IncidentDetail,
  IncidentFilterParams,
  IncidentListResponse,
  CreateIncidentPayload,
  UpdateIncidentPayload,
  ChangeStatusPayload,
  AssignIncidentPayload,
  CandidateResponder,
} from "@/types/incident";

export const incidentService = {
  /**
   * Fetches paginated, filtered, and sorted list of incidents scoped to user authority.
   */
  async getIncidents(params?: IncidentFilterParams): Promise<IncidentListResponse> {
    const response = await api.get<IncidentListResponse>("/incidents", {
      params,
    });
    return response.data;
  },

  /**
   * Fetches full incident details by ID including history, assignments, and investigation.
   */
  async getIncidentById(id: string): Promise<IncidentDetail> {
    const response = await api.get<{ success: boolean; data: IncidentDetail }>(
      `/incidents/${id}`
    );
    return response.data.data;
  },

  /**
   * Reports a new incident. Requires `incident:create` permission.
   */
  async createIncident(payload: CreateIncidentPayload): Promise<IncidentItem> {
    const response = await api.post<{ success: boolean; message: string; data: IncidentItem }>(
      "/incidents",
      payload
    );
    return response.data.data;
  },

  /**
   * Updates incident classification, description, tags, or title.
   */
  async updateIncident(
    id: string,
    payload: UpdateIncidentPayload
  ): Promise<IncidentDetail> {
    const response = await api.patch<{ success: boolean; message: string; data: IncidentDetail }>(
      `/incidents/${id}`,
      payload
    );
    return response.data.data;
  },

  /**
   * Transitions lifecycle state according to the valid state machine.
   */
  async changeStatus(
    id: string,
    payload: ChangeStatusPayload
  ): Promise<IncidentDetail> {
    const response = await api.post<{ success: boolean; message: string; data: IncidentDetail }>(
      `/incidents/${id}/status`,
      payload
    );
    return response.data.data;
  },

  /**
   * Assigns or reassigns an incident to an active responder.
   */
  async assignIncident(
    id: string,
    payload: AssignIncidentPayload
  ): Promise<IncidentDetail> {
    const response = await api.post<{ success: boolean; message: string; data: IncidentDetail }>(
      `/incidents/${id}/assign`,
      payload
    );
    return response.data.data;
  },

  /**
   * Retrieves active users eligible for incident response assignments.
   */
  async getResponders(): Promise<CandidateResponder[]> {
    const response = await api.get<{ success: boolean; data: CandidateResponder[] }>(
      "/incidents/responders"
    );
    return response.data.data;
  },
};

