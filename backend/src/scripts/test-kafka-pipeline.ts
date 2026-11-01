import app from "../app.js";
import { prisma } from "../config/prisma.js";
import { connectKafka, disconnectKafka, kafkaProducer } from "../config/kafka.js";
import { dispatchOutboxEvents } from "../services/outbox.service.js";
import { eventEnvelopeSchema, TOPICS } from "../events/eventTypes.js";
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
    throw new Error(`Role ${roleCode} not found in database.`);
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
        lastName: "PipelineTester",
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

async function runKafkaPipelineTests(): Promise<void> {
  console.log("==========================================");
  console.log("   BATCH 11: KAFKA OUTBOX PIPELINE TESTS  ");
  console.log("==========================================");

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

  const commander = await findOrCreateUser(`kcommander_${ts}@suraksha.local`, "INCIDENT_COMMANDER");
  const investigator = await findOrCreateUser(`kinvestigator_${ts}@suraksha.local`, "INVESTIGATOR");
  const employee = await findOrCreateUser(`kemployee_${ts}@suraksha.local`, "EMPLOYEE");

  console.log("  Users ready: Commander, Investigator, Employee");

  try {
    // -------------------------------------------------------------------------
    // Suite 1: Transactional Outbox Staging on Incident Creation
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 1: Transactional Outbox Staging on Incident Creation ---");

    const createRes = await makeRequest("/incidents", {
      method: "POST",
      token: employee.token,
      body: {
        title: "Kafka Pipeline Integration Incident",
        description: "Testing transactional outbox insertion during incident creation.",
        severity: "HIGH",
        priority: "P2",
        category: "SUSPICIOUS_ACTIVITY",
      },
    });

    assert(createRes.status === 201, "1.1 Incident creation returns 201 Created");
    const incidentId = createRes.data?.data?.id;
    assert(Boolean(incidentId), "1.2 Returned incident has valid ID");

    // Check OutboxEvent in DB
    const outboxCreated = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: incidentId,
        eventType: "INCIDENT_CREATED",
      },
    });

    assert(Boolean(outboxCreated), "1.3 OutboxEvent for INCIDENT_CREATED exists in database");
    assert(outboxCreated?.status === "PENDING" || outboxCreated?.status === "PUBLISHED", "1.4 OutboxEvent status is valid (PENDING or already PUBLISHED by async trigger)");
    assert(outboxCreated?.topic === TOPICS.INCIDENT_EVENTS, "1.5 OutboxEvent topic is incident-events");
    assert(outboxCreated?.aggregateType === "INCIDENT", "1.6 OutboxEvent aggregateType is INCIDENT");

    // Validate event envelope schema
    const envelopeValidation = eventEnvelopeSchema.safeParse(outboxCreated?.payload);
    assert(envelopeValidation.success, "1.7 Staged payload strictly conforms to eventEnvelopeSchema");
    if (!envelopeValidation.success) {
      console.error("  Envelope parse errors:", envelopeValidation.error.issues);
    }

    // -------------------------------------------------------------------------
    // Suite 2: Staging on Update, Assignment, and Escalation
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 2: Staging on Update, Assignment, and Escalation ---");

    // 2.1 Update
    const updateRes = await makeRequest(`/incidents/${incidentId}`, {
      method: "PATCH",
      token: commander.token,
      body: {
        title: "Updated Title for Kafka Pipeline Test",
        severity: "CRITICAL",
      },
    });
    assert(updateRes.status === 200, "2.1 Update incident returns 200 OK");

    const outboxUpdated = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: incidentId,
        eventType: "INCIDENT_UPDATED",
      },
    });
    assert(Boolean(outboxUpdated), "2.2 OutboxEvent for INCIDENT_UPDATED recorded in database");

    // 2.2 Assignment
    const assignRes = await makeRequest(`/incidents/${incidentId}/assign`, {
      method: "POST",
      token: commander.token,
      body: {
        userId: investigator.id,
        role: "PRIMARY_RESPONDER",
      },
    });
    assert(assignRes.status === 200, "2.3 Assign incident returns 200 OK");

    const outboxAssigned = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: incidentId,
        eventType: "INCIDENT_ASSIGNED",
      },
    });
    assert(Boolean(outboxAssigned), "2.4 OutboxEvent for INCIDENT_ASSIGNED recorded in database");

    // 2.3 Escalation
    const escalateRes = await makeRequest(`/incidents/${incidentId}/status`, {
      method: "POST",
      token: commander.token,
      body: {
        status: "ESCALATED",
        notes: "Automated escalation test for Kafka pipeline",
      },
    });
    assert(escalateRes.status === 200, "2.5 Escalating incident returns 200 OK");

    const outboxEscalated = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: incidentId,
        eventType: "INCIDENT_ESCALATED",
      },
    });
    assert(Boolean(outboxEscalated), "2.6 OutboxEvent for INCIDENT_ESCALATED recorded in database");

    // -------------------------------------------------------------------------
    // Suite 3: Outbox Dispatcher Verification
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 3: Outbox Dispatcher Verification ---");

    // Manually trigger dispatch to ensure all pending events are published
    // Wait briefly in case an asynchronous triggerOutboxDispatch is in-flight
    await new Promise((resolve) => setTimeout(resolve, 500));
    const dispatched = await dispatchOutboxEvents(50);
    console.log(`  Dispatched ${dispatched} pending events during manual sweep`);

    // Verify all outbox records for this incident are now PUBLISHED
    const records = await prisma.outboxEvent.findMany({
      where: { aggregateId: incidentId },
    });

    console.log("  Records status:", records.map((r) => ({ type: r.eventType, status: r.status, err: r.lastError })));

    assert(records.length >= 4, `3.1 Found at least 4 outbox records for incident (actual: ${records.length})`);
    const allPublished = records.every((r) => r.status === "PUBLISHED" && r.publishedAt !== null);
    assert(allPublished, "3.2 All outbox events have status: PUBLISHED and non-null publishedAt");

    const zeroRemaining = await dispatchOutboxEvents(50);
    assert(zeroRemaining === 0, "3.3 Subsequent dispatch finds 0 pending events");

    // -------------------------------------------------------------------------
    // Suite 4: Transaction Rollback Integrity
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 4: Transaction Rollback Integrity ---");

    // Attempting an invalid status transition should fail AND roll back the outbox event
    const initialCount = await prisma.outboxEvent.count();

    const invalidTransitionRes = await makeRequest(`/incidents/${incidentId}/status`, {
      method: "POST",
      token: commander.token,
      body: {
        toStatus: "CLOSED", // Invalid transition from ESCALATED directly to CLOSED
      },
    });
    assert(invalidTransitionRes.status === 400, "4.1 Invalid lifecycle transition rejected with 400");

    const afterCount = await prisma.outboxEvent.count();
    assert(initialCount === afterCount, "4.2 Transaction rolled back cleanly - no orphaned OutboxEvent staged");

  } finally {
    server.close();
    await disconnectKafka();
    await prisma.$disconnect();
  }

  console.log("\n==========================================");
  console.log(`TEST RUN SUMMARY:`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

void runKafkaPipelineTests();
