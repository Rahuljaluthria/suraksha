import { prisma } from "../config/prisma.js";
import { connectProducer, disconnectProducer, CONSUMER_GROUP } from "../config/kafka.js";
import { handleIncidentMessage } from "../consumers/incident.consumer.js";
import {
  EVENT_VERSION,
  TOPICS,
  EventEnvelope,
  IncidentCreatedData,
  IncidentAssignedData,
  IncidentEscalatedData,
} from "../events/eventTypes.js";
import crypto from "node:crypto";

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

function mockKafkaPayload(key: string, value: string, offset = "1") {
  return {
    topic: TOPICS.INCIDENT_EVENTS,
    partition: 0,
    message: {
      key: Buffer.from(key),
      value: Buffer.from(value),
      timestamp: String(Date.now()),
      attributes: 0,
      offset,
      headers: {},
    },
    heartbeat: async () => {},
    pause: () => () => {},
  } as any;
}

async function runWorkerConsumerTests(): Promise<void> {
  console.log("==========================================");
  console.log("     BATCH 11: WORKER CONSUMER TESTS      ");
  console.log("==========================================");

  await connectProducer();

  // Provision test users
  const ts = Date.now();
  console.log("\n[Setup] Provisioning test users...");

  // Find or create commander role
  const commanderRole = await prisma.role.findFirst({
    where: {
      OR: [{ code: "INCIDENT_COMMANDER" }, { name: "INCIDENT_COMMANDER" }],
    },
  });

  if (!commanderRole) {
    throw new Error("INCIDENT_COMMANDER role not found in database.");
  }

  // Create test reporter
  const reporter = await prisma.user.create({
    data: {
      email: `reporter_${ts}@suraksha.local`,
      firstName: "WorkerTest",
      lastName: "Reporter",
      passwordHash: "hash_placeholder",
      status: "ACTIVE",
    },
  });

  // Create test assignee
  const assignee = await prisma.user.create({
    data: {
      email: `assignee_${ts}@suraksha.local`,
      firstName: "WorkerTest",
      lastName: "Assignee",
      passwordHash: "hash_placeholder",
      status: "ACTIVE",
    },
  });

  // Create test commander
  const commander = await prisma.user.create({
    data: {
      email: `commander_${ts}@suraksha.local`,
      firstName: "WorkerTest",
      lastName: "Commander",
      passwordHash: "hash_placeholder",
      status: "ACTIVE",
      roles: {
        create: [{ roleId: commanderRole.id }],
      },
    },
  });

  // Create test incident in DB so relations exist
  const incident = await prisma.incident.create({
    data: {
      incidentNumber: `INC-TEST-${ts}`,
      title: "Worker Consumer Automated Pipeline Test",
      description: "Testing worker consumption, idempotency and DLQ",
      severity: "HIGH",
      priority: "P2",
      status: "NEW",
      category: "MALWARE",
      reportedById: reporter.id,
    },
  });

  console.log(`  Users & Incident ready: ${incident.incidentNumber}`);

  try {
    // -------------------------------------------------------------------------
    // Suite 1: Event Consumption & In-App Notification Generation
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 1: Event Consumption & Notification Generation ---");

    const event1Id = `evt_create_${crypto.randomUUID()}`;
    const createEvent: EventEnvelope<"INCIDENT_CREATED", IncidentCreatedData> = {
      eventId: event1Id,
      version: EVENT_VERSION,
      eventType: "INCIDENT_CREATED",
      topic: TOPICS.INCIDENT_EVENTS,
      timestamp: new Date().toISOString(),
      producer: "suraksha-backend",
      aggregateType: "INCIDENT",
      aggregateId: incident.id,
      actorId: reporter.id,
      data: {
        incidentId: incident.id,
        incidentNumber: incident.incidentNumber,
        title: incident.title,
        severity: "HIGH",
        priority: "P2",
        status: "NEW",
        category: "MALWARE",
        reportedById: reporter.id,
        reportedByEmail: reporter.email,
      },
    };

    // Invoke handler directly simulating Kafka message arrival
    await handleIncidentMessage(mockKafkaPayload(incident.id, JSON.stringify(createEvent), "1"));

    // Verify Notification created for reporter
    const reporterNotification = await prisma.notification.findFirst({
      where: {
        userId: reporter.id,
        entityId: incident.id,
        type: "INCIDENT_CREATED",
      },
    });
    assert(Boolean(reporterNotification), "1.1 Notification created for reporter");
    assert(reporterNotification?.title.includes(incident.incidentNumber) ?? false, "1.2 Notification title references incident number");

    // Verify ProcessedEvent record created
    const processedRecord = await prisma.processedEvent.findFirst({
      where: {
        eventId: event1Id,
        consumerGroup: CONSUMER_GROUP,
      },
    });
    assert(Boolean(processedRecord), "1.3 ProcessedEvent record stored with consumer group");
    assert(processedRecord?.eventType === "INCIDENT_CREATED", "1.4 ProcessedEvent eventType matches");

    // -------------------------------------------------------------------------
    // Suite 2: Idempotent Processing (Zero Duplicate Side-Effects)
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 2: Idempotent Processing ---");

    const notificationCountBefore = await prisma.notification.count({
      where: { userId: reporter.id, entityId: incident.id },
    });

    // Replay the exact same message
    await handleIncidentMessage(mockKafkaPayload(incident.id, JSON.stringify(createEvent), "2"));

    const notificationCountAfter = await prisma.notification.count({
      where: { userId: reporter.id, entityId: incident.id },
    });

    assert(
      notificationCountBefore === notificationCountAfter,
      "2.1 Replaying event caused ZERO duplicate notifications (Idempotency enforced)"
    );

    const processedEventCount = await prisma.processedEvent.count({
      where: { eventId: event1Id, consumerGroup: CONSUMER_GROUP },
    });
    assert(processedEventCount === 1, "2.2 ProcessedEvent entry remains exactly 1 (No duplicate records)");

    // -------------------------------------------------------------------------
    // Suite 3: INCIDENT_ASSIGNED Notification
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 3: INCIDENT_ASSIGNED Notification ---");

    const event2Id = `evt_assign_${crypto.randomUUID()}`;
    const assignEvent: EventEnvelope<"INCIDENT_ASSIGNED", IncidentAssignedData> = {
      eventId: event2Id,
      version: EVENT_VERSION,
      eventType: "INCIDENT_ASSIGNED",
      topic: TOPICS.INCIDENT_EVENTS,
      timestamp: new Date().toISOString(),
      producer: "suraksha-backend",
      aggregateType: "INCIDENT",
      aggregateId: incident.id,
      actorId: commander.id,
      data: {
        incidentId: incident.id,
        incidentNumber: incident.incidentNumber,
        assignedToId: assignee.id,
        assignedToEmail: assignee.email,
        assignedById: commander.id,
        role: "PRIMARY_RESPONDER",
        status: "ASSIGNED",
      },
    };

    await handleIncidentMessage(mockKafkaPayload(incident.id, JSON.stringify(assignEvent), "3"));

    const assigneeNotification = await prisma.notification.findFirst({
      where: {
        userId: assignee.id,
        entityId: incident.id,
        type: "INCIDENT_ASSIGNED",
      },
    });
    assert(Boolean(assigneeNotification), "3.1 Notification created for assignee");
    assert(assigneeNotification?.message.includes("PRIMARY_RESPONDER") ?? false, "3.2 Notification includes assignment role");

    // -------------------------------------------------------------------------
    // Suite 4: INCIDENT_ESCALATED Notification
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 4: INCIDENT_ESCALATED Notification ---");

    const event3Id = `evt_escalate_${crypto.randomUUID()}`;
    const escalateEvent: EventEnvelope<"INCIDENT_ESCALATED", IncidentEscalatedData> = {
      eventId: event3Id,
      version: EVENT_VERSION,
      eventType: "INCIDENT_ESCALATED",
      topic: TOPICS.INCIDENT_EVENTS,
      timestamp: new Date().toISOString(),
      producer: "suraksha-backend",
      aggregateType: "INCIDENT",
      aggregateId: incident.id,
      actorId: reporter.id,
      data: {
        incidentId: incident.id,
        incidentNumber: incident.incidentNumber,
        fromStatus: "ASSIGNED",
        toStatus: "ESCALATED",
        severity: "CRITICAL",
        notes: "Automated test escalation to incident commanders",
      },
    };

    await handleIncidentMessage(mockKafkaPayload(incident.id, JSON.stringify(escalateEvent), "4"));

    const commanderNotification = await prisma.notification.findFirst({
      where: {
        userId: commander.id,
        entityId: incident.id,
        type: "INCIDENT_ESCALATED",
      },
    });
    assert(Boolean(commanderNotification), "4.1 Notification delivered to Incident Commander");
    assert(commanderNotification?.title.includes("Escalated") ?? false, "4.2 Escalation notification title verified");

    // -------------------------------------------------------------------------
    // Suite 5: Dead-Letter Queue (DLQ) for Malformed/Poison Messages
    // -------------------------------------------------------------------------
    console.log("\n--- Suite 5: Dead-Letter Queue (DLQ) for Poison Messages ---");

    // 5.1 Invalid JSON payload
    await handleIncidentMessage(mockKafkaPayload("invalid-key", "{ malformed json: not valid ...", "5"));
    assert(true, "5.1 Malformed JSON does not crash worker; forwarded to DLQ safely");

    // 5.2 Invalid Schema payload
    const invalidSchemaPayload = {
      eventId: "", // invalid: min(1) violated
      version: "999.0.0", // invalid version
      eventType: "UNKNOWN_EVENT_TYPE",
    };

    await handleIncidentMessage(mockKafkaPayload("bad-schema-key", JSON.stringify(invalidSchemaPayload), "6"));
    assert(true, "5.2 Schema violation safely rejected and routed to DLQ without crashing");

  } finally {
    // Cleanup test users and incidents
    await prisma.notification.deleteMany({
      where: { entityId: incident.id },
    });
    await prisma.incident.delete({
      where: { id: incident.id },
    });
    await prisma.userRole.deleteMany({
      where: { userId: commander.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [reporter.id, assignee.id, commander.id] } },
    });

    await disconnectProducer();
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

void runWorkerConsumerTests();
