export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type IncidentPriority = "P1" | "P2" | "P3" | "P4";

export type IncidentStatus =
  | "NEW"
  | "TRIAGED"
  | "ASSIGNED"
  | "INVESTIGATING"
  | "REMEDIATING"
  | "VERIFYING"
  | "RESOLVED"
  | "CLOSED"
  | "REJECTED"
  | "REOPENED"
  | "ESCALATED";

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface IncidentAssignmentItem {
  id: string;
  incidentId: string;
  userId: string;
  role: string;
  isActive: boolean;
  assignedAt: string;
  unassignedAt?: string | null;
  user: UserSummary;
  assignedBy?: UserSummary | null;
}

export interface IncidentHistoryItem {
  id: string;
  incidentId: string;
  actorId?: string | null;
  action: string;
  fromStatus?: IncidentStatus | null;
  toStatus?: IncidentStatus | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: UserSummary | null;
}

export interface InvestigationDetail {
  id: string;
  incidentId: string;
  leadId?: string | null;
  summary?: string | null;
  hypotheses?: unknown;
  findings?: string | null;
  rootCause?: string | null;
  status: string;
  startedAt: string;
  concludedAt?: string | null;
  lead?: UserSummary | null;
}

export interface IncidentItem {
  id: string;
  incidentNumber: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  status: IncidentStatus;
  category: string;
  tags?: string[] | null;
  reportedById: string;
  assignedToId?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reportedBy: UserSummary;
  assignedTo?: UserSummary | null;
  assignments?: IncidentAssignmentItem[];
}

export interface IncidentDetail extends IncidentItem {
  assignments: IncidentAssignmentItem[];
  history: IncidentHistoryItem[];
  investigation?: InvestigationDetail | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IncidentListResponse {
  success: boolean;
  data: IncidentItem[];
  pagination: PaginationMeta;
}

export interface IncidentFilterParams {
  page?: number;
  limit?: number;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  priority?: IncidentPriority;
  category?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "severity" | "priority" | "status" | "title";
  sortOrder?: "asc" | "desc";
}

export interface CreateIncidentPayload {
  title: string;
  description: string;
  severity?: IncidentSeverity;
  priority?: IncidentPriority;
  category: string;
  tags?: string[];
}

export interface UpdateIncidentPayload {
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  priority?: IncidentPriority;
  category?: string;
  tags?: string[];
}

export interface ChangeStatusPayload {
  status: IncidentStatus;
  notes?: string;
}

export interface AssignIncidentPayload {
  userId: string;
  role?: string;
  notes?: string;
}

export interface CandidateResponder {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

