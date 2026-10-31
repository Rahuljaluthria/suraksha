import app from "../app.js";
import { prisma } from "../config/prisma.js";
import { connectKafka, disconnectKafka } from "../config/kafka.js";
import { createAccessToken } from "../utils/tokens.js";
import { hashPassword } from "../utils/password.js";
import { ROLES, type RoleCode } from "../config/rbac.js";
import type { Server } from "node:http";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

interface TestUser {
  id: string;
  email: string;
  role: RoleCode;
  token: string;
}

async function findOrCreateUser(email: string, roleCode: RoleCode): Promise<TestUser> {
  const role = await prisma.role.findUnique({
    where: { code: roleCode },
    include: { permissions: { include: { permission: true } } },
  });

  if (!role) {
    throw new Error(`Role ${roleCode} not found in database. Please run seed script first.`);
  }

  const roleDef = ROLES[roleCode];
  const permissions = roleDef.permissions as unknown as string[];

  let user = await prisma.user.findUnique({
    where: { email },
    include: { roles: true },
  });

  if (!user) {
    const passwordHash = await hashPassword("TestPassword@123");
    user = await prisma.user.create({
      data: {
        email,
        firstName: roleCode,
        lastName: "Tester",
        passwordHash,
        status: "ACTIVE",
        roles: {
          create: [{ roleId: role.id }],
        },
      },
      include: { roles: true },
    });
  } else {
    const hasRole = user.roles.some((r) => r.roleId === role.id);
    if (!hasRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }
  }

  const token = await createAccessToken({
    userId: user.id,
    email: user.email,
    roles: [roleCode],
    permissions,
  });

  return {
    id: user.id,
    email: user.email,
    role: roleCode,
    token,
  };
}

async function runIncidentTests(): Promise<void> {
  console.log("========================================");
  console.log("   BATCH 8: INCIDENT MANAGEMENT TESTS   ");
  console.log("========================================");

  // 1. Start ephemeral Express server
  await connectKafka();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const makeRequest = async (
    path: string,
    options: {
      method?: string;
      body?: unknown;
      token?: string;
    } = {}
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (options.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {}

    return { status: response.status, data };
  };

  const ts = Date.now();
  console.log("\n[Setup] Provisioning test users...");

  const commander = await findOrCreateUser(`commander_${ts}@suraksha.local`, "INCIDENT_COMMANDER");
  const analyst = await findOrCreateUser(`analyst_${ts}@suraksha.local`, "SECURITY_ANALYST");
  const investigator = await findOrCreateUser(`investigator_${ts}@suraksha.local`, "INVESTIGATOR");
  const employee1 = await findOrCreateUser(`emp1_${ts}@suraksha.local`, "EMPLOYEE");
  const employee2 = await findOrCreateUser(`emp2_${ts}@suraksha.local`, "EMPLOYEE");
  const auditor = await findOrCreateUser(`auditor_${ts}@suraksha.local`, "AUDITOR");

  console.log("  Users ready: Commander, Analyst, Investigator, Employee1, Employee2, Auditor");

  let incident1Id = "";
  let incident1Number = "";
  let incident2Id = "";

  // ----------------------------------------------------
  // TEST SUITE 1: Incident Creation & Validation
  // ----------------------------------------------------
  console.log("\n--- Suite 1: Incident Creation & Validation ---");

  // 1.1 Unauthenticated request returns 401
  const unauthRes = await makeRequest("/incidents", {
    method: "POST",
    body: { title: "Test", description: "Test incident description", category: "PHISHING" },
  });
  assert(unauthRes.status === 401, "1.1 Unauthenticated incident creation returns 401");

  // 1.2 Auditor without incident:create returns 403
  const auditorCreateRes = await makeRequest("/incidents", {
    method: "POST",
    token: auditor.token,
    body: { title: "Auditor test", description: "Auditor should not report", category: "OTHER" },
  });
  assert(auditorCreateRes.status === 403, "1.2 Auditor attempting incident creation returns 403");

  // 1.3 Validation failure on short title returns 400
  const validationRes = await makeRequest("/incidents", {
    method: "POST",
    token: employee1.token,
    body: { title: "AB", description: "Valid length description", category: "PHISHING" },
  });
  assert(validationRes.status === 400, "1.3 Short title triggers Zod validation error 400");

  // 1.4 Employee1 successfully reports incident
  const createRes1 = await makeRequest("/incidents", {
    method: "POST",
    token: employee1.token,
    body: {
      title: "Suspicious Phishing Email detected on Workstations",
      description: "Multiple employees received an urgent invoice email containing a suspicious macro-enabled Excel attachment.",
      severity: "MEDIUM",
      priority: "P2",
      category: "PHISHING",
      tags: ["email", "endpoint", "phishing"],
    },
  });

  assert(createRes1.status === 201, "1.4 Employee1 successfully creates incident (201 Created)");
  assert(createRes1.data.success === true, "1.4 Response has success: true");
  assert(createRes1.data.data.status === "NEW", "1.4 Initial status is NEW");
  assert(
    createRes1.data.data.incidentNumber.startsWith("INC-"),
    `1.4 Generated incident number ${createRes1.data?.data?.incidentNumber} follows INC-YYYY-XXXX format`
  );

  incident1Id = createRes1.data.data.id;
  incident1Number = createRes1.data.data.incidentNumber;

  // 1.5 Employee2 creates a different incident
  const createRes2 = await makeRequest("/incidents", {
    method: "POST",
    token: employee2.token,
    body: {
      title: "Unusual SSH outbound connection from Staging DB",
      description: "Outbound SSH connection detected from private staging database to unknown public IP.",
      severity: "HIGH",
      priority: "P1",
      category: "UNAUTHORIZED_ACCESS",
      tags: ["network", "staging", "ssh"],
    },
  });
  assert(createRes2.status === 201, "1.5 Employee2 creates another incident (201 Created)");
  incident2Id = createRes2.data.data.id;

  // ----------------------------------------------------
  // TEST SUITE 2: Scoped Incident Listing & Filtering
  // ----------------------------------------------------
  console.log("\n--- Suite 2: Scoped Incident Listing & Filtering ---");

  // 2.1 Employee1 only sees their own reported incident
  const emp1List = await makeRequest("/incidents", { token: employee1.token });
  if (emp1List.status !== 200) {
    console.log("DEBUG emp1List failed:", JSON.stringify(emp1List));
  }
  assert(emp1List.status === 200, "2.1 Employee1 can list incidents");
  const emp1IncidentIds = emp1List.data.data.map((i: any) => i.id);
  assert(
    emp1IncidentIds.includes(incident1Id) && !emp1IncidentIds.includes(incident2Id),
    "2.1 Employee1 only sees own incident (scoped view: own)"
  );

  // 2.2 Commander sees all incidents
  const commanderList = await makeRequest("/incidents", { token: commander.token });
  assert(commanderList.status === 200, "2.2 Commander can list incidents");
  const commanderIncidentIds = commanderList.data.data.map((i: any) => i.id);
  assert(
    commanderIncidentIds.includes(incident1Id) && commanderIncidentIds.includes(incident2Id),
    "2.2 Commander sees all incidents (universal view: all)"
  );

  // 2.3 Auditor sees all incidents
  const auditorList = await makeRequest("/incidents", { token: auditor.token });
  assert(auditorList.status === 200, "2.3 Auditor can list incidents");
  const auditorIncidentIds = auditorList.data.data.map((i: any) => i.id);
  assert(
    auditorIncidentIds.includes(incident1Id) && auditorIncidentIds.includes(incident2Id),
    "2.3 Auditor sees all incidents (universal view: all)"
  );

  // 2.4 Category filtering
  const filterList = await makeRequest("/incidents?category=PHISHING", { token: commander.token });
  assert(
    filterList.status === 200 && filterList.data.data.every((i: any) => i.category.includes("PHISHING")),
    "2.4 Filtering by category=PHISHING returns matching subset"
  );

  // 2.5 Pagination
  const pageList = await makeRequest("/incidents?page=1&limit=1", { token: commander.token });
  assert(
    pageList.status === 200 &&
      pageList.data.pagination.limit === 1 &&
      pageList.data.data.length === 1 &&
      pageList.data.pagination.total >= 2,
    "2.5 Pagination limit and total counts returned correctly"
  );

  // 2.6 Sorting
  const sortAsc = await makeRequest("/incidents?sortBy=createdAt&sortOrder=asc", { token: commander.token });
  const sortDesc = await makeRequest("/incidents?sortBy=createdAt&sortOrder=desc", { token: commander.token });
  assert(
    sortAsc.status === 200 && sortDesc.status === 200,
    "2.6 Sorting by createdAt asc and desc succeeds"
  );

  // ----------------------------------------------------
  // TEST SUITE 3: Resource-Level Authorization on Details
  // ----------------------------------------------------
  console.log("\n--- Suite 3: Resource-Level Authorization on Details ---");

  // 3.1 Employee1 can view their own incident
  const emp1GetOwn = await makeRequest(`/incidents/${incident1Id}`, { token: employee1.token });
  assert(emp1GetOwn.status === 200, "3.1 Employee1 can retrieve own incident details");
  assert(emp1GetOwn.data.data.reportedById === employee1.id, "3.1 Returned incident reportedById matches");

  // 3.2 Employee2 CANNOT view Employee1's incident
  const emp2GetForbidden = await makeRequest(`/incidents/${incident1Id}`, { token: employee2.token });
  assert(
    emp2GetForbidden.status === 403,
    "3.2 Employee2 is forbidden (403) from accessing another employee's incident"
  );

  // 3.3 Commander can view Employee1's incident
  const commanderGet = await makeRequest(`/incidents/${incident1Id}`, { token: commander.token });
  assert(commanderGet.status === 200, "3.3 Incident Commander can view any incident");

  // 3.4 Auditor can view incident details
  const auditorGet = await makeRequest(`/incidents/${incident1Id}`, { token: auditor.token });
  assert(auditorGet.status === 200, "3.4 Auditor can view incident details");

  // ----------------------------------------------------
  // TEST SUITE 4: Incident Assignment & Reassignment
  // ----------------------------------------------------
  console.log("\n--- Suite 4: Incident Assignment & Reassignment ---");

  // 4.1 Employee cannot assign
  const empAssignRes = await makeRequest(`/incidents/${incident1Id}/assign`, {
    method: "POST",
    token: employee1.token,
    body: { userId: investigator.id },
  });
  assert(empAssignRes.status === 403, "4.1 Employee cannot assign incidents (403 Forbidden)");

  // 4.2 Assigning to non-existent user returns 400
  const invalidUserAssign = await makeRequest(`/incidents/${incident1Id}/assign`, {
    method: "POST",
    token: commander.token,
    body: { userId: "non-existent-user-id" },
  });
  assert(invalidUserAssign.status === 400, "4.2 Assigning to non-existent user returns 400");

  // 4.3 Assigning to non-responder (Employee) returns 400
  const invalidRoleAssign = await makeRequest(`/incidents/${incident1Id}/assign`, {
    method: "POST",
    token: commander.token,
    body: { userId: employee2.id },
  });
  assert(invalidRoleAssign.status === 400, "4.3 Assigning to non-responder role returns 400 INVALID_ASSIGNEE_ROLE");

  // 4.4 Commander assigns incident to Investigator
  const assignRes = await makeRequest(`/incidents/${incident1Id}/assign`, {
    method: "POST",
    token: commander.token,
    body: {
      userId: investigator.id,
      role: "PRIMARY_RESPONDER",
      notes: "Assigned to Lead Investigator for phishing header analysis",
    },
  });
  assert(assignRes.status === 200, "4.4 Commander successfully assigns incident to Investigator");
  assert(assignRes.data.data.assignedToId === investigator.id, "4.4 assignedToId updated to Investigator");
  assert(assignRes.data.data.status === "ASSIGNED", "4.4 Status auto-advanced from NEW to ASSIGNED");

  // 4.5 Investigator now has assigned-scope access to list and get
  const investigatorList = await makeRequest("/incidents", { token: investigator.token });
  const invIncidentIds = investigatorList.data.data.map((i: any) => i.id);
  assert(
    invIncidentIds.includes(incident1Id),
    "4.5 Investigator now sees the assigned incident in incident:read:assigned list"
  );

  const investigatorGet = await makeRequest(`/incidents/${incident1Id}`, { token: investigator.token });
  assert(investigatorGet.status === 200, "4.5 Investigator can retrieve assigned incident details");

  // ----------------------------------------------------
  // TEST SUITE 5: Incident Property Updates
  // ----------------------------------------------------
  console.log("\n--- Suite 5: Incident Property Updates ---");

  // 5.1 Commander updates severity and title
  const updateRes = await makeRequest(`/incidents/${incident1Id}`, {
    method: "PATCH",
    token: commander.token,
    body: {
      title: "Confirmed Phishing Campaign Targeting Accounts Payable",
      severity: "HIGH",
      priority: "P1",
    },
  });
  assert(updateRes.status === 200, "5.1 Commander successfully updates incident details");
  assert(updateRes.data.data.severity === "HIGH", "5.1 Severity updated to HIGH");
  assert(updateRes.data.data.priority === "P1", "5.1 Priority updated to P1");

  // 5.2 Auditor is strictly blocked from update (read-only enforcement)
  const auditorUpdate = await makeRequest(`/incidents/${incident1Id}`, {
    method: "PATCH",
    token: auditor.token,
    body: { title: "Auditor attempting modification" },
  });
  assert(
    auditorUpdate.status === 403,
    "5.2 Auditor is strictly blocked from write/update operations (403 Forbidden)"
  );

  // ----------------------------------------------------
  // TEST SUITE 6: Lifecycle State Machine Transitions
  // ----------------------------------------------------
  console.log("\n--- Suite 6: Lifecycle State Machine Transitions ---");

  // Current status is ASSIGNED
  // 6.1 Invalid transition: ASSIGNED -> CLOSED (forbidden jump)
  const invalidJumpRes = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: commander.token,
    body: { status: "CLOSED" },
  });
  assert(
    invalidJumpRes.status === 400 && invalidJumpRes.data.code === "INVALID_LIFECYCLE_TRANSITION",
    "6.1 Invalid transition ASSIGNED -> CLOSED rejected with 400 INVALID_LIFECYCLE_TRANSITION"
  );

  // 6.2 Valid transition: ASSIGNED -> INVESTIGATING
  const t1 = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: analyst.token,
    body: { status: "INVESTIGATING", notes: "Forensic image captured. Investigating payload." },
  });
  assert(t1.status === 200 && t1.data?.data?.status === "INVESTIGATING", "6.2 ASSIGNED -> INVESTIGATING succeeds");

  // 6.3 Valid transition: INVESTIGATING -> REMEDIATING
  const t2 = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: analyst.token,
    body: { status: "REMEDIATING", notes: "Blocking malicious sender domain and isolating workstation." },
  });
  assert(t2.status === 200 && t2.data?.data?.status === "REMEDIATING", "6.3 INVESTIGATING -> REMEDIATING succeeds");

  // 6.4 Valid transition: REMEDIATING -> VERIFYING
  const t3 = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: commander.token,
    body: { status: "VERIFYING", notes: "Verifying firewall block rules and checking secondary endpoints." },
  });
  assert(t3.status === 200 && t3.data?.data?.status === "VERIFYING", "6.4 REMEDIATING -> VERIFYING succeeds");

  // 6.5 Analyst without incident:close permission cannot resolve
  const analystResolve = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: analyst.token,
    body: { status: "RESOLVED" },
  });
  assert(
    analystResolve.status === 403,
    "6.5 Analyst without incident:close permission cannot transition to RESOLVED (403)"
  );

  // 6.6 Commander with incident:close resolves incident
  const t4 = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: commander.token,
    body: { status: "RESOLVED", notes: "All IOCs eradicated, endpoint restored." },
  });
  assert(t4.status === 200 && t4.data?.data?.status === "RESOLVED", "6.6 VERIFYING -> RESOLVED succeeds");
  assert(Boolean(t4.data?.data?.resolvedAt), "6.6 resolvedAt timestamp recorded");

  // 6.7 Commander closes incident
  const t5 = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: commander.token,
    body: { status: "CLOSED", notes: "Incident closed. Post-mortem scheduled." },
  });
  assert(t5.status === 200 && t5.data?.data?.status === "CLOSED", "6.7 RESOLVED -> CLOSED succeeds");
  assert(Boolean(t5.data?.data?.closedAt), "6.7 closedAt timestamp recorded");

  // 6.8 Commander reopens incident
  const t6 = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: commander.token,
    body: { status: "REOPENED", notes: "Secondary beacon detected. Reopening incident." },
  });
  assert(t6.status === 200 && t6.data?.data?.status === "REOPENED", "6.8 CLOSED -> REOPENED succeeds");
  assert(t6.data?.data?.resolvedAt === null && t6.data?.data?.closedAt === null, "6.8 Reopened clears resolvedAt/closedAt");

  // 6.9 REOPENED -> TRIAGED -> REJECTED
  const t7 = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: analyst.token,
    body: { status: "TRIAGED", notes: "Re-triaging secondary alert." },
  });
  assert(t7.status === 200 && t7.data?.data?.status === "TRIAGED", "6.9 REOPENED -> TRIAGED succeeds");

  const t8 = await makeRequest(`/incidents/${incident1Id}/status`, {
    method: "POST",
    token: analyst.token,
    body: { status: "REJECTED", notes: "Beacon determined to be benign internal scanner." },
  });
  assert(t8.status === 200 && t8.data?.data?.status === "REJECTED", "6.9 TRIAGED -> REJECTED succeeds");

  // ----------------------------------------------------
  // TEST SUITE 7: Incident History & Audit Integrity
  // ----------------------------------------------------
  console.log("\n--- Suite 7: Incident History & Audit Integrity ---");

  const historyEntries = await prisma.incidentHistory.findMany({
    where: { incidentId: incident1Id },
    orderBy: { createdAt: "asc" },
  });

  const historyActions = historyEntries.map((h) => h.action);
  assert(
    historyActions.includes("CREATED") &&
      historyActions.includes("ASSIGNED") &&
      historyActions.includes("SEVERITY_ASSESSED") &&
      historyActions.includes("STATUS_CHANGE"),
    `7.1 IncidentHistory records all lifecycle events (${historyEntries.length} entries)`
  );

  const auditEntries = await prisma.auditLog.findMany({
    where: { entityType: "Incident", entityId: incident1Id },
  });

  const auditActions = auditEntries.map((a) => a.action);
  assert(
    auditActions.includes("INCIDENT_CREATED") &&
      auditActions.includes("INCIDENT_ASSIGNED") &&
      auditActions.includes("INCIDENT_UPDATED") &&
      auditActions.includes("INCIDENT_STATUS_CHANGED"),
    `7.2 AuditLog records all mutating operations (${auditEntries.length} entries)`
  );

  // Clean up server
  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log("\n========================================");
  console.log(`TEST RUN SUMMARY:`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log("========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runIncidentTests()
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await disconnectKafka();
    } catch {}
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
