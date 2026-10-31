import { z } from "zod";

export const incidentSeverityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const incidentPriorityEnum = z.enum(["P1", "P2", "P3", "P4"]);
export const incidentStatusEnum = z.enum([
  "NEW",
  "TRIAGED",
  "ASSIGNED",
  "INVESTIGATING",
  "REMEDIATING",
  "VERIFYING",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
  "REOPENED",
  "ESCALATED",
]);

export const createIncidentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(255, "Title cannot exceed 255 characters"),
  description: z
    .string()
    .trim()
    .min(5, "Description must be at least 5 characters")
    .max(10000, "Description cannot exceed 10,000 characters"),
  severity: incidentSeverityEnum.optional().default("MEDIUM"),
  priority: incidentPriorityEnum.optional().default("P3"),
  category: z
    .string()
    .trim()
    .min(2, "Category must be at least 2 characters")
    .max(100, "Category cannot exceed 100 characters"),
  tags: z.array(z.string().trim().min(1).max(50)).optional(),
});

export const updateIncidentSchema = z
  .object({
    title: z.string().trim().min(3).max(255).optional(),
    description: z.string().trim().min(5).max(10000).optional(),
    severity: incidentSeverityEnum.optional(),
    priority: incidentPriorityEnum.optional(),
    category: z.string().trim().min(2).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).optional(),
  })
  .refine(
    (data) => Object.values(data).some((val) => val !== undefined),
    { message: "At least one field must be provided to update" }
  );

export const changeStatusSchema = z.object({
  status: incidentStatusEnum,
  notes: z.string().trim().max(2000, "Notes cannot exceed 2,000 characters").optional(),
});

export const assignIncidentSchema = z.object({
  userId: z.string().trim().min(1, "Assignee User ID is required"),
  role: z.string().trim().min(1).max(50).optional().default("PRIMARY_RESPONDER"),
  notes: z.string().trim().max(2000, "Notes cannot exceed 2,000 characters").optional(),
});

export const queryIncidentsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: incidentStatusEnum.optional(),
  severity: incidentSeverityEnum.optional(),
  priority: incidentPriorityEnum.optional(),
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "severity", "priority", "status", "title"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type AssignIncidentInput = z.infer<typeof assignIncidentSchema>;
export type QueryIncidentsInput = z.infer<typeof queryIncidentsSchema>;

