import { prisma } from "../config/prisma.js";
import { kafkaProducer } from "../config/kafka.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { EventEnvelope } from "../events/eventTypes.js";

/**
 * Stages an event into the Outbox table inside an ongoing Prisma database transaction.
 * This guarantees the event is stored atomically with business data changes.
 */
export async function stageOutboxEvent(
  tx: Prisma.TransactionClient,
  event: EventEnvelope
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      eventId: event.eventId,
      eventType: event.eventType,
      topic: event.topic,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event as unknown as Prisma.InputJsonValue,
      headers: {
        eventType: event.eventType,
        timestamp: event.timestamp,
        version: event.version,
      },
      status: "PENDING",
    },
  });
}

let isDispatching = false;

/**
 * Polls and publishes pending outbox events to Kafka.
 * Updates event status to PUBLISHED upon successful receipt.
 */
export async function dispatchOutboxEvents(batchSize = 25): Promise<number> {
  if (isDispatching) {
    return 0; // Concurrency protection
  }

  isDispatching = true;
  let dispatchedCount = 0;

  try {
    const pendingEvents = await prisma.outboxEvent.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    for (const record of pendingEvents) {
      try {
        await kafkaProducer.send({
          topic: record.topic,
          messages: [
            {
              key: record.aggregateId,
              value: JSON.stringify(record.payload),
              headers: (record.headers as Record<string, string>) || {},
            },
          ],
        });

        await prisma.outboxEvent.update({
          where: { id: record.id },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });

        dispatchedCount++;
      } catch (sendError: unknown) {
        const errorMsg =
          sendError instanceof Error ? sendError.message : String(sendError);

        const newRetryCount = record.retryCount + 1;
        const newStatus = newRetryCount >= 5 ? "FAILED" : "PENDING";

        console.warn(
          `[Outbox] Failed to publish event ${record.eventId} (attempt ${newRetryCount}): ${errorMsg}`
        );

        await prisma.outboxEvent.update({
          where: { id: record.id },
          data: {
            retryCount: newRetryCount,
            lastError: errorMsg,
            status: newStatus,
          },
        });
      }
    }
  } catch (error) {
    console.error("[Outbox] Dispatch polling cycle error:", error);
  } finally {
    isDispatching = false;
  }

  return dispatchedCount;
}

let pollingInterval: NodeJS.Timeout | null = null;

/**
 * Starts the continuous outbox background polling worker.
 */
export function startOutboxDispatcher(intervalMs = 3000): void {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    await dispatchOutboxEvents();
  }, intervalMs);

  console.log(`[Outbox] Dispatcher started (polling interval: ${intervalMs}ms)`);
}

/**
 * Stops the outbox dispatcher on server shutdown.
 */
export function stopOutboxDispatcher(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[Outbox] Dispatcher stopped");
  }
}

/**
 * Triggers an immediate dispatch run asynchronously without waiting for the next polling tick.
 */
export function triggerOutboxDispatch(): void {
  setImmediate(async () => {
    try {
      await dispatchOutboxEvents();
    } catch {
      // Non-blocking
    }
  });
}

