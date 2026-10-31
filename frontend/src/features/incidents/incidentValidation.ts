import { z } from "zod";

export const reportIncidentValidationSchema = z.object({
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
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  category: z
    .string()
    .trim()
    .min(2, "Category is required")
    .max(100, "Category cannot exceed 100 characters"),
  tagsInput: z.string().optional(),
});

export const transitionStatusValidationSchema = z.object({
  status: z.enum([
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
  ]),
  notes: z.string().trim().max(2000, "Notes cannot exceed 2,000 characters").optional(),
});

export const assignIncidentValidationSchema = z.object({
  userId: z.string().trim().min(1, "Please select an active responder"),
  role: z.string().trim().min(1, "Role is required").default("PRIMARY_RESPONDER"),
  notes: z.string().trim().max(2000, "Notes cannot exceed 2,000 characters").optional(),
});

export type ReportIncidentFormValues = z.infer<typeof reportIncidentValidationSchema>;
export type TransitionStatusFormValues = z.infer<typeof transitionStatusValidationSchema>;
export type AssignIncidentFormValues = z.infer<typeof assignIncidentValidationSchema>;

