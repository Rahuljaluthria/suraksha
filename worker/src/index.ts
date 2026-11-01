import "dotenv/config";
import { connectProducer, disconnectProducer } from "./config/kafka.js";
import { startIncidentConsumer, stopIncidentConsumer } from "./consumers/incident.consumer.js";
import { prisma } from "./config/prisma.js";

const startWorker = async (): Promise<void> => {
  try {
    console.log("==========================================");
    console.log("       SURAKSHA EVENT WORKER v1.0.0       ");
    console.log("==========================================");

    await connectProducer();
    await startIncidentConsumer();

    console.log("[Worker] All consumers and producers initialized successfully");
    console.log("==========================================");
  } catch (error) {
    console.error("[Worker] Startup failed:", error);
    process.exit(1);
  }
};

let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Worker] Received ${signal}. Initiating graceful shutdown...`);

  try {
    await stopIncidentConsumer();
    await disconnectProducer();
    await prisma.$disconnect();
    console.log("[Worker] Graceful shutdown complete. Exiting cleanly.");
    process.exit(0);
  } catch (error) {
    console.error("[Worker] Shutdown encountered errors:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void startWorker();
