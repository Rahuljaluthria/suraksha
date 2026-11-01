import { EachMessagePayload } from "kafkajs";
import { consumer, CONSUMER_GROUP } from "../config/kafka.js";
import { prisma } from "../config/prisma.js";
import {
  TOPICS,
  eventEnvelopeSchema,
  EventEnvelope,
} from "../events/eventTypes.js";
import { processNotificationEvent } from "../processors/notification.processor.js";
import { publishToDlq } from "../publishers/dlq.publisher.js";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [500, 1500, 3000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleIncidentMessage({
  topic,
  partition,
  message,
}: EachMessagePayload): Promise<void> {
  const rawValue = message.value?.toString();
  if (!rawValue) {
    console.warn(`[Incident Consumer] Empty message received on ${topic}[${partition}]`);
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch (err: unknown) {
    const parseError = err instanceof Error ? err : new Error("JSON parse failure");
    console.error(`[Incident Consumer] Poison message - invalid JSON on ${topic}[${partition}]:`, parseError);
    await publishToDlq(topic, { raw: rawValue.slice(0, 1000) }, parseError, 1);
    return;
  }

  const parseResult = eventEnvelopeSchema.safeParse(parsed);
  if (!parseResult.success) {
    console.error(
      `[Incident Consumer] Schema validation failed for event on ${topic}[${partition}]:`,
      parseResult.error.issues
    );
    await publishToDlq(
      topic,
      parsed,
      new Error(`Schema validation error: ${parseResult.error.message}`),
      1
    );
    return;
  }

  const event: EventEnvelope = parseResult.data as EventEnvelope;

  // 1. Idempotency Check
  const existingRecord = await prisma.processedEvent.findFirst({
    where: {
      eventId: event.eventId,
      consumerGroup: CONSUMER_GROUP,
    },
  });

  if (existingRecord) {
    console.log(
      `[Incident Consumer] Idempotency guard: Event ${event.eventId} (${event.eventType}) already processed by ${CONSUMER_GROUP} at ${existingRecord.processedAt.toISOString()}. Skipping.`
    );
    return;
  }

  // 2. Bounded Retries Loop
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      console.log(
        `[Incident Consumer] Processing event ${event.eventId} (${event.eventType}) - Attempt ${attempt}/${MAX_RETRIES}`
      );

      await processNotificationEvent(event);

      // 3. Mark processed on success
      await prisma.processedEvent.create({
        data: {
          eventId: event.eventId,
          consumerGroup: CONSUMER_GROUP,
          eventType: event.eventType,
        },
      });

      console.log(
        `[Incident Consumer] Successfully processed and recorded event ${event.eventId} (${event.eventType})`
      );
      return;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[Incident Consumer] Error processing event ${event.eventId} on attempt ${attempt}: ${lastError.message}`
      );

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt - 1] || 2000;
        console.log(`[Incident Consumer] Retrying after ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  // 4. Exhausted retries -> DLQ routing
  console.error(
    `[Incident Consumer] All ${MAX_RETRIES} attempts failed for event ${event.eventId}. Forwarding to DLQ...`
  );

  try {
    await publishToDlq(
      topic,
      event,
      lastError || new Error("Max retries exceeded"),
      MAX_RETRIES
    );

    // Record as processed with DLQ status to prevent partition-blocking loops
    await prisma.processedEvent.create({
      data: {
        eventId: event.eventId,
        consumerGroup: CONSUMER_GROUP,
        eventType: `${event.eventType}:DLQ_FORWARDED`,
      },
    });
  } catch (dlqErr) {
    console.error(`[Incident Consumer] CRITICAL: Failed to publish to DLQ for event ${event.eventId}:`, dlqErr);
    throw dlqErr; // Let Kafka rebalance/crash if even DLQ cannot be reached
  }
}

let isSubscribed = false;

export async function startIncidentConsumer(): Promise<void> {
  if (isSubscribed) return;

  await consumer.connect();
  console.log(`[Incident Consumer] Consumer connected to Kafka group: ${CONSUMER_GROUP}`);

  await consumer.subscribe({
    topic: TOPICS.INCIDENT_EVENTS,
    fromBeginning: false,
  });

  isSubscribed = true;

  await consumer.run({
    autoCommit: true,
    eachMessage: handleIncidentMessage,
  });

  console.log(`[Incident Consumer] Actively listening to topic: ${TOPICS.INCIDENT_EVENTS}`);
}

export async function stopIncidentConsumer(): Promise<void> {
  if (!isSubscribed) return;

  console.log("[Incident Consumer] Disconnecting consumer...");
  await consumer.disconnect();
  isSubscribed = false;
  console.log("[Incident Consumer] Consumer disconnected");
}

