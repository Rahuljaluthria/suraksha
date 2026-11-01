import { producer, connectProducer } from "../config/kafka.js";
import { TOPICS, DlqEventEnvelope } from "../events/eventTypes.js";
import crypto from "node:crypto";

export async function publishToDlq(
  originalTopic: string,
  failedEvent: unknown,
  error: Error,
  attempts: number
): Promise<void> {
  await connectProducer();

  const dlqPayload: DlqEventEnvelope = {
    dlqId: `dlq_${crypto.randomUUID()}`,
    failedEvent,
    originalTopic,
    error: {
      name: error.name || "Error",
      message: error.message || "Unknown error occurred",
      stack: error.stack,
    },
    attempts,
    failedAt: new Date().toISOString(),
  };

  const partitionKey =
    typeof failedEvent === "object" && failedEvent !== null
      ? (failedEvent as Record<string, unknown>).eventId?.toString() ||
        (failedEvent as Record<string, unknown>).aggregateId?.toString() ||
        "dlq-error"
      : "dlq-error";

  await producer.send({
    topic: TOPICS.INCIDENT_EVENTS_DLQ,
    messages: [
      {
        key: partitionKey,
        value: JSON.stringify(dlqPayload),
        headers: {
          "x-dlq-reason": error.message.slice(0, 255),
          "x-original-topic": originalTopic,
          "x-attempts": String(attempts),
        },
      },
    ],
  });

  console.error(
    `[DLQ] Published poison event to ${TOPICS.INCIDENT_EVENTS_DLQ} (dlqId: ${dlqPayload.dlqId}, attempts: ${attempts})`
  );
}

