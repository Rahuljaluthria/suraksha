import { z } from "zod";

export const EVENT_VERSION = "1.0.0" as const;

export const TOPICS = {
  INCIDENT_EVENTS: "incident-events",
  NOTIFICATION_EVENTS: "notification-events",
  INCIDENT_EVENTS_DLQ: "incident-events.dlq",
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

export const EVENT_TYPES = {
  INCIDENT_CREATED: "INCIDENT_CREATED",
  INCIDENT_UPDATED: "INCIDENT_UPDATED",
  INCIDENT_ASSIGNED: "INCIDENT_ASSIGNED",
  INCIDENT_STATUS_CHANGED: "INCIDENT_STATUS_CHANGED",
  INCIDENT_ESCALATED: "INCIDENT_ESCALATED",
  AI_REPORT_GENERATED: "AI_REPORT_GENERATED",
  AI_ANALYSIS_COMPLETED: "AI_ANALYSIS_COMPLETED",
  REMEDIATION_SUGGESTIONS_GENERATED: "REMEDIATION_SUGGESTIONS_GENERATED",
  NOTIFICATION_DISPATCHED: "NOTIFICATION_DISPATCHED",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// 1. INCIDENT_CREATED
export const incidentCreatedDataSchema = z.object({
  incidentId: z.string(),
  incidentNumber: z.string(),
  title: z.string(),
  severity: z.string(),
  priority: z.string(),
  status: z.string(),
  category: z.string(),
  reportedById: z.string(),
  reportedByEmail: z.string().optional(),
});
export type IncidentCreatedData = z.infer<typeof incidentCreatedDataSchema>;

// 2. INCIDENT_UPDATED
export const incidentUpdatedDataSchema = z.object({
  incidentId: z.string(),
  incidentNumber: z.string(),
  changedFields: z.record(z.string(), z.unknown()),
  severity: z.string().optional(),
  priority: z.string().optional(),
  title: z.string().optional(),
  category: z.string().optional(),
});
export type IncidentUpdatedData = z.infer<typeof incidentUpdatedDataSchema>;

// 3. INCIDENT_ASSIGNED
export const incidentAssignedDataSchema = z.object({
  incidentId: z.string(),
  incidentNumber: z.string(),
  assignedToId: z.string(),
  assignedToEmail: z.string().optional(),
  assignedById: z.string().optional().nullable(),
  role: z.string(),
  status: z.string(),
});
export type IncidentAssignedData = z.infer<typeof incidentAssignedDataSchema>;

// 4. INCIDENT_STATUS_CHANGED
export const incidentStatusChangedDataSchema = z.object({
  incidentId: z.string(),
  incidentNumber: z.string(),
  fromStatus: z.string(),
  toStatus: z.string(),
  notes: z.string().optional().nullable(),
});
export type IncidentStatusChangedData = z.infer<typeof incidentStatusChangedDataSchema>;

// 5. INCIDENT_ESCALATED
export const incidentEscalatedDataSchema = z.object({
  incidentId: z.string(),
  incidentNumber: z.string(),
  fromStatus: z.string(),
  toStatus: z.literal("ESCALATED"),
  severity: z.string().optional(),
  notes: z.string().optional().nullable(),
});
export type IncidentEscalatedData = z.infer<typeof incidentEscalatedDataSchema>;

// 6. AI_REPORT_GENERATED
export const aiReportGeneratedDataSchema = z.object({
  requestId: z.string().optional(),
  actorId: z.string().optional().nullable(),
  inputChars: z.number(),
  redactionCounts: z.record(z.string(), z.number()).optional(),
  promptVersion: z.string(),
  suggestedCategory: z.string().optional(),
  suggestedSeverity: z.string().optional(),
});
export type AiReportGeneratedData = z.infer<typeof aiReportGeneratedDataSchema>;

// 7. AI_ANALYSIS_COMPLETED
export const aiAnalysisCompletedDataSchema = z.object({
  incidentId: z.string(),
  incidentNumber: z.string(),
  actorId: z.string().optional().nullable(),
  promptVersion: z.string(),
  factsCount: z.number(),
  hypothesesCount: z.number(),
  confidence: z.string().optional(),
});
export type AiAnalysisCompletedData = z.infer<typeof aiAnalysisCompletedDataSchema>;

// 8. REMEDIATION_SUGGESTIONS_GENERATED
export const remediationSuggestionsGeneratedDataSchema = z.object({
  incidentId: z.string(),
  incidentNumber: z.string(),
  actorId: z.string().optional().nullable(),
  promptVersion: z.string(),
  recommendationsCount: z.number(),
  riskFlags: z.array(z.string()).optional(),
});
export type RemediationSuggestionsGeneratedData = z.infer<
  typeof remediationSuggestionsGeneratedDataSchema
>;

// 9. NOTIFICATION_DISPATCHED
export const notificationDispatchedDataSchema = z.object({
  notificationId: z.string(),
  userId: z.string(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
});
export type NotificationDispatchedData = z.infer<
  typeof notificationDispatchedDataSchema
>;

// Base Event Envelope
export interface EventEnvelope<TType extends EventType = EventType, TData = Record<string, unknown>> {
  eventId: string;
  version: typeof EVENT_VERSION;
  eventType: TType;
  topic: TopicName;
  timestamp: string;
  producer: string;
  aggregateType: "INCIDENT" | "AI" | "NOTIFICATION";
  aggregateId: string;
  actorId?: string | null;
  data: TData;
}

export const eventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  version: z.literal(EVENT_VERSION),
  eventType: z.enum([
    "INCIDENT_CREATED",
    "INCIDENT_UPDATED",
    "INCIDENT_ASSIGNED",
    "INCIDENT_STATUS_CHANGED",
    "INCIDENT_ESCALATED",
    "AI_REPORT_GENERATED",
    "AI_ANALYSIS_COMPLETED",
    "REMEDIATION_SUGGESTIONS_GENERATED",
    "NOTIFICATION_DISPATCHED",
  ]),
  topic: z.enum([
    "incident-events",
    "notification-events",
    "incident-events.dlq",
  ]),
  timestamp: z.string(),
  producer: z.string().min(1),
  aggregateType: z.enum(["INCIDENT", "AI", "NOTIFICATION"]),
  aggregateId: z.string(),
  actorId: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()),
});

// DLQ Event Envelope
export interface DlqEventEnvelope {
  dlqId: string;
  failedEvent: unknown;
  originalTopic: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  attempts: number;
  failedAt: string;
}

export const dlqEventSchema = z.object({
  dlqId: z.string(),
  failedEvent: z.unknown(),
  originalTopic: z.string(),
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
  }),
  attempts: z.number(),
  failedAt: z.string(),
});
