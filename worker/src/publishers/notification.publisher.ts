import { producer, connectProducer } from "../config/kafka.js";
import {
  TOPICS,
  EVENT_VERSION,
  EventEnvelope,
  NotificationDispatchedData,
} from "../events/eventTypes.js";
import crypto from "node:crypto";

export async function publishNotificationDispatched(
  notification: {
    id: string;
    userId: string;
    title: string;
    message: string;
    type: string;
    entityType?: string | null;
    entityId?: string | null;
  }
): Promise<void> {
  await connectProducer();

  const eventPayload: EventEnvelope<"NOTIFICATION_DISPATCHED", NotificationDispatchedData> = {
    eventId: `evt_${crypto.randomUUID()}`,
    version: EVENT_VERSION,
    eventType: "NOTIFICATION_DISPATCHED",
    topic: TOPICS.NOTIFICATION_EVENTS,
    timestamp: new Date().toISOString(),
    producer: "suraksha-worker",
    aggregateType: "NOTIFICATION",
    aggregateId: notification.id,
    actorId: null,
    data: {
      notificationId: notification.id,
      userId: notification.userId,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      entityType: notification.entityType,
      entityId: notification.entityId,
    },
  };

  await producer.send({
    topic: TOPICS.NOTIFICATION_EVENTS,
    messages: [
      {
        key: notification.userId,
        value: JSON.stringify(eventPayload),
        headers: {
          "x-event-id": eventPayload.eventId,
          "x-event-type": eventPayload.eventType,
          "x-user-id": notification.userId,
        },
      },
    ],
  });

  console.log(
    `[Worker Kafka] Dispatched notification event ${eventPayload.eventId} for user ${notification.userId}`
  );
}

