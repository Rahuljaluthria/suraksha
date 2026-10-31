
import "dotenv/config";
import { Kafka, logLevel } from "kafkajs";

const brokers = (process.env.KAFKA_BROKERS || "localhost:9094")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

const kafka = new Kafka({
  clientId: "suraksha-worker",
  brokers,
  logLevel: logLevel.ERROR,
});

const consumer = kafka.consumer({
  groupId: "suraksha-worker-group",
});

const startWorker = async (): Promise<void> => {
  try {
    await consumer.connect();

    console.log("----------------------------------");
    console.log("       SURAKSHA WORKER");
    console.log("----------------------------------");
    console.log("[Kafka] Worker connected successfully");
    console.log("[Worker] Initialized and waiting for Phase 6 processing");
    console.log("----------------------------------");
  } catch (error) {
    console.error("[Worker] Startup failed:", error);
    throw error;
  }
};

const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n[Worker] Received ${signal}. Shutting down...`);

  try {
    await consumer.disconnect();
    console.log("[Worker] Kafka disconnected");
    process.exit(0);
  } catch (error) {
    console.error("[Worker] Shutdown failed:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

startWorker().catch(() => {
  process.exit(1);
});
