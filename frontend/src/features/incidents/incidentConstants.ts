import type { IncidentStatus, IncidentSeverity, IncidentPriority } from "@/types/incident";

export const ALLOWED_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  NEW: ["TRIAGED", "ASSIGNED", "REJECTED"],
  TRIAGED: ["ASSIGNED", "REJECTED", "INVESTIGATING"],
  ASSIGNED: ["INVESTIGATING", "ESCALATED", "TRIAGED"],
  INVESTIGATING: ["REMEDIATING", "ESCALATED", "ASSIGNED", "RESOLVED"],
  REMEDIATING: ["VERIFYING", "INVESTIGATING", "ESCALATED"],
  VERIFYING: ["RESOLVED", "REMEDIATING", "INVESTIGATING"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REJECTED: ["REOPENED"],
  ESCALATED: ["INVESTIGATING", "REMEDIATING", "ASSIGNED"],
  REOPENED: ["TRIAGED", "ASSIGNED", "INVESTIGATING"],
};

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

export const SEVERITY_CONFIG: Record<
  IncidentSeverity,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  CRITICAL: {
    label: "Critical",
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-500",
  },
  HIGH: {
    label: "High",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/30",
    dot: "bg-orange-500",
  },
  MEDIUM: {
    label: "Medium",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-500",
  },
  LOW: {
    label: "Low",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
    dot: "bg-blue-500",
  },
};

export const PRIORITY_CONFIG: Record<
  IncidentPriority,
  { label: string; badge: string }
> = {
  P1: { label: "P1 - Critical", badge: "bg-red-500/15 text-red-400 border-red-500/30" },
  P2: { label: "P2 - High", badge: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  P3: { label: "P3 - Moderate", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  P4: { label: "P4 - Low", badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

export const STATUS_CONFIG: Record<
  IncidentStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  NEW: {
    label: "New",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    border: "border-sky-500/30",
  },
  TRIAGED: {
    label: "Triaged",
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
    border: "border-indigo-500/30",
  },
  ASSIGNED: {
    label: "Assigned",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
  },
  INVESTIGATING: {
    label: "Investigating",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  REMEDIATING: {
    label: "Remediating",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/30",
  },
  VERIFYING: {
    label: "Verifying",
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/30",
  },
  RESOLVED: {
    label: "Resolved",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  CLOSED: {
    label: "Closed",
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    border: "border-zinc-500/30",
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/30",
  },
  REOPENED: {
    label: "Reopened",
    bg: "bg-amber-600/10",
    text: "text-amber-500",
    border: "border-amber-600/30",
  },
  ESCALATED: {
    label: "Escalated",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/40",
  },
};

