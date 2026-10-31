/**
 * RBAC catalogue: the single source of truth for system roles, permissions and
 * the role -> permission mapping. Consumed by the seed script today and by the
 * authorization middleware later.
 *
 * Two layers of authorization exist and must not be conflated:
 *
 * 1. Role-level (this file): "may this user perform this kind of action at all?"
 *    e.g. `incident:read:own` lets a user read incidents *in the own scope*.
 * 2. Resource-level (services, later): "may this user act on THIS record?"
 *    - `:own`      -> record.reportedById === user.id
 *    - `:assigned` -> user is an assignee/investigator on the record
 *    - `:all`      -> no per-record check
 *    A permission with a scope suffix is only the gate; the service must still
 *    apply the matching ownership/assignment check.
 */

export const PERMISSIONS = {
  // Incident management
  "incident:create": "Report a new security incident",
  "incident:read:own": "View incidents the user reported",
  "incident:read:assigned": "View incidents the user is assigned to",
  "incident:read:all": "View all incidents",
  "incident:update": "Edit incident details and status",
  "incident:assess": "Classify incident severity, priority and category",
  "incident:assign": "Assign incidents to responders",
  "incident:escalate": "Escalate an incident to a higher response level",
  "incident:close": "Resolve and close incidents",
  "incident:comment": "Comment on incidents the user can access",

  // Investigation
  "investigation:read": "View investigations and findings",
  "investigation:create": "Open an investigation for an incident",
  "investigation:update": "Record findings and update investigations",
  "investigation:evidence:manage": "Add and manage investigation evidence",

  // Remediation
  "remediation:read": "View remediation plans and tasks",
  "remediation:create": "Create remediation plans and tasks",
  "remediation:update": "Update remediation progress",
  "remediation:approve": "Approve remediation plans for execution",

  // User and access management
  "user:read": "View user accounts",
  "user:create": "Create user accounts",
  "user:update": "Update user accounts",
  "user:disable": "Suspend or disable user accounts",
  "role:read": "View roles and their permissions",
  "role:assign": "Assign and revoke user roles",
  "role:manage": "Change which permissions a role grants",
  "permission:read": "View the permission catalogue",
  "system:configure": "Change system configuration",

  // Reports
  "report:read": "View reports and metrics",
  "report:generate": "Generate reports",
  "report:export": "Export reports",

  // AI assistance (advisory only; every result needs human review)
  "ai:draft_report": "Use AI to draft an incident report from a description",
  "ai:analyze": "Use AI to analyse an incident the user can access",
  "ai:recommend": "Use AI to get remediation suggestions for an accessible incident",

  // Audit
  "audit:read": "View audit logs",
  "audit:export": "Export audit logs",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export type RoleCode =
  | "ADMIN"
  | "EMPLOYEE"
  | "INVESTIGATOR"
  | "SECURITY_ENGINEER"
  | "SECURITY_ANALYST"
  | "INCIDENT_COMMANDER"
  | "AUDITOR";

interface RoleDefinition {
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}

export const ROLES: Record<RoleCode, RoleDefinition> = {
  ADMIN: {
    name: "Administrator",
    description:
      "Manages users, roles and system configuration. No access to incident content.",
    permissions: [
      "user:read",
      "user:create",
      "user:update",
      "user:disable",
      "role:read",
      "role:assign",
      "role:manage",
      "permission:read",
      "system:configure",
      "audit:read",
      "report:read",
    ],
  },
  EMPLOYEE: {
    name: "Employee",
    description: "Reports incidents and follows the ones they reported.",
    permissions: [
      "incident:create",
      "incident:read:own",
      "incident:comment",
      "ai:draft_report",
    ],
  },
  INVESTIGATOR: {
    name: "Investigator",
    description: "Investigates incidents assigned to them and manages evidence.",
    permissions: [
      "incident:read:assigned",
      "incident:comment",
      "investigation:read",
      "investigation:create",
      "investigation:update",
      "investigation:evidence:manage",
      "remediation:read",
      "report:read",
      "ai:analyze",
    ],
  },
  SECURITY_ENGINEER: {
    name: "Security Engineer",
    description:
      "Performs technical investigation and carries out remediation on assigned incidents.",
    permissions: [
      "incident:read:assigned",
      "incident:comment",
      "investigation:read",
      "investigation:update",
      "investigation:evidence:manage",
      "remediation:read",
      "remediation:create",
      "remediation:update",
      "ai:analyze",
      "ai:recommend",
    ],
  },
  SECURITY_ANALYST: {
    name: "Security Analyst",
    description: "Monitors and analyses incidents, and assesses severity and priority.",
    permissions: [
      "incident:read:all",
      "incident:update",
      "incident:assess",
      "incident:escalate",
      "incident:comment",
      "investigation:read",
      "remediation:read",
      "report:read",
      "report:generate",
      "ai:analyze",
      "ai:recommend",
    ],
  },
  INCIDENT_COMMANDER: {
    name: "Incident Commander",
    description:
      "Oversees incident response: assignment, escalation, remediation approval and closure.",
    permissions: [
      "incident:read:all",
      "incident:update",
      "incident:assess",
      "incident:assign",
      "incident:escalate",
      "incident:close",
      "incident:comment",
      "investigation:read",
      "investigation:create",
      "remediation:read",
      "remediation:approve",
      "user:read",
      "report:read",
      "report:generate",
      "report:export",
      "ai:analyze",
      "ai:recommend",
    ],
  },
  AUDITOR: {
    name: "Auditor",
    description: "Read-only access to incidents, reports and audit records.",
    permissions: [
      "incident:read:all",
      "investigation:read",
      "remediation:read",
      "report:read",
      "report:export",
      "audit:read",
      "audit:export",
    ],
  },
};
