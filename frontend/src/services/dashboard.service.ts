import { api } from "./api";
import { incidentService } from "./incident.service";
import type {
  IncidentStats,
  NotificationsPayload,
  SecurityActivity,
  SystemHealth,
} from "@/types/dashboard";
import type { IncidentItem } from "@/types/incident";

export const dashboardService = {
  /** Scoped, server-cached (60s) incident statistics including the health score. */
  async getStats(): Promise<IncidentStats> {
    const response = await api.get<{ success: boolean; data: IncidentStats }>("/incidents/stats");
    return response.data.data;
  },

  /** Most recently updated incidents the user may read. */
  async getRecentIncidents(limit = 8): Promise<IncidentItem[]> {
    const response = await incidentService.getIncidents({
      limit,
      sortBy: "updatedAt",
      sortOrder: "desc",
    });
    return response.data;
  },

  /** Real MySQL, Redis, Kafka and event-pipeline status. */
  async getSystemHealth(): Promise<SystemHealth> {
    const response = await api.get<{ success: boolean; data: SystemHealth }>("/health/details");
    return response.data.data;
  },

  async getNotifications(limit = 20): Promise<NotificationsPayload> {
    const response = await api.get<{ success: boolean; data: NotificationsPayload }>("/notifications", {
      params: { limit },
    });
    return response.data.data;
  },

  /** Aggregated authentication and access events. Requires audit:read. */
  async getSecurityActivity(hours: 6 | 24 | 72 = 24): Promise<SecurityActivity> {
    const response = await api.get<{ success: boolean; data: SecurityActivity }>("/security/activity", {
      params: { hours },
    });
    return response.data.data;
  },
};
