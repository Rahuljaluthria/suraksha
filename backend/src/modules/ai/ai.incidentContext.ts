import type { getIncidentById } from "../incidents/incident.service.js";
import { redactText, type IpMaskMode, type RedactionResult } from "./redaction.js";
import { ANALYSIS_SOURCES, type AnalysisSource } from "./ai.schemas.js";

export type IncidentRecord = Awaited<ReturnType<typeof getIncidentById>>;
export type IncidentSections = Record<AnalysisSource, string>;

const MAX_HISTORY_ENTRIES = 30;
const MAX_NOTE_CHARS = 500;
const MAX_FIELD_CHARS = 3000;

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

/**
 * Builds the only view of an incident the model ever sees: an explicit allowlist of
 * fields. Reporter and responder identities (names, emails, ids) are deliberately
 * left out; only counts and role labels are included.
 */
export function buildIncidentSections(incident: IncidentRecord): IncidentSections {
  const tags = Array.isArray(incident.tags)
    ? incident.tags.filter((t): t is string => typeof t === "string")
    : [];
  const activeAssignments = incident.assignments.filter((a) => a.isActive);

  const metadata = [
    `Incident number: ${incident.incidentNumber}`,
    `Title: ${incident.title}`,
    `Category: ${incident.category}`,
    `Recorded severity: ${incident.severity} (a human or AI-assisted estimate, not verified)`,
    `Recorded priority: ${incident.priority}`,
    `Status: ${incident.status}`,
    `Created: ${incident.createdAt.toISOString()}`,
    incident.resolvedAt ? `Resolved: ${incident.resolvedAt.toISOString()}` : null,
    tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
    `Active responders: ${activeAssignments.length}${
      activeAssignments.length > 0
        ? ` (roles: ${[...new Set(activeAssignments.map((a) => a.role))].join(", ")})`
        : ""
    }`,
  ]
    .filter(Boolean)
    .join("\n");

  const history = [...incident.history]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-MAX_HISTORY_ENTRIES)
    .map((h) => {
      const transition = h.fromStatus && h.toStatus ? ` ${h.fromStatus}->${h.toStatus}` : "";
      const notes = h.notes ? `: ${truncate(h.notes, MAX_NOTE_CHARS)}` : "";
      return `${h.createdAt.toISOString()} ${h.action}${transition}${notes}`;
    });

  const inv = incident.investigation;
  const investigation = inv
    ? [
        `Status: ${inv.status}`,
        inv.summary ? `Summary: ${truncate(inv.summary, MAX_FIELD_CHARS)}` : null,
        inv.findings ? `Findings: ${truncate(inv.findings, MAX_FIELD_CHARS)}` : null,
        inv.rootCause ? `Root cause recorded by the team: ${truncate(inv.rootCause, MAX_FIELD_CHARS)}` : null,
        inv.hypotheses ? `Hypotheses recorded by the team: ${truncate(JSON.stringify(inv.hypotheses), 1500)}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "(no investigation recorded)";

  return {
    METADATA: metadata,
    DESCRIPTION: incident.description,
    HISTORY: history.length > 0 ? history.join("\n") : "(no history recorded)",
    INVESTIGATION: investigation,
  };
}

const marker = (name: string) => `\n@@SECTION ${name}@@\n`;
const MARKER_SPLIT = /\n@@SECTION ([A-Z]+)@@\n/;

/**
 * Redacts all sections in one pass so placeholders stay consistent across them
 * ([EMAIL_1] means the same address everywhere) and can be restored afterwards.
 */
export function redactSections(
  sections: IncidentSections,
  ipMode: IpMaskMode
): { sections: IncidentSections; redaction: RedactionResult; inputChars: number } {
  // Stop incident text from forging a section boundary.
  const safe = (text: string) => text.replaceAll("@@SECTION", "@ @SECTION");
  const joined = ANALYSIS_SOURCES.map((name) => marker(name) + safe(sections[name])).join("");

  const redaction = redactText(joined, ipMode);
  const parts = redaction.text.split(MARKER_SPLIT); // ["", NAME, body, NAME, body, ...]

  const redacted = {} as IncidentSections;
  for (let i = 1; i < parts.length; i += 2) {
    redacted[parts[i] as AnalysisSource] = (parts[i + 1] ?? "").trim();
  }
  for (const name of ANALYSIS_SOURCES) redacted[name] ??= "";

  const inputChars = ANALYSIS_SOURCES.reduce((sum, name) => sum + sections[name].length, 0);
  return { sections: redacted, redaction, inputChars };
}

export interface PreparedIncidentContext {
  incident: { id: string; incidentNumber: string; updatedAt: Date; severity: string; status: string };
  sections: IncidentSections;
  redaction: RedactionResult;
  inputChars: number;
  historyEntries: number;
  hasInvestigation: boolean;
}

/**
 * Builds and redacts the allowlisted incident view shared by analysis and remediation.
 * Done before any provider call so a failed call can still be audited with size and redaction counts.
 */
export function prepareIncidentContext(
  incident: IncidentRecord,
  ipMode: IpMaskMode
): PreparedIncidentContext {
  const { sections, redaction, inputChars } = redactSections(buildIncidentSections(incident), ipMode);
  return {
    incident: {
      id: incident.id,
      incidentNumber: incident.incidentNumber,
      updatedAt: incident.updatedAt,
      severity: incident.severity,
      status: incident.status,
    },
    sections,
    redaction,
    inputChars,
    historyEntries: Math.min(incident.history.length, MAX_HISTORY_ENTRIES),
    hasInvestigation: incident.investigation !== null,
  };
}
