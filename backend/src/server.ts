
import "dotenv/config";
import type { Server } from "node:http";

import app from "./app.js";
import { prisma } from "./config/prisma.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { connectKafka, disconnectKafka } from "./config/kafka.js";

const PORT = Number(process.env.PORT) || 5000;

let server: Server | undefined;
let shuttingDown = false;

const startServer = async (): Promise<void> => {
  try {
    console.log("[Backend] Starting Suraksha...");

    await connectRedis();
    await connectKafka();

    server = app.listen(PORT, () => {
      console.log("----------------------------------");
      console.log("       SURAKSHA BACKEND");
      console.log("----------------------------------");
      console.log(`Server: http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/api/health`);
      console.log("[Redis] Ready");
      console.log("[Kafka] Ready");
      console.log("----------------------------------");
    });
  } catch (error) {
    console.error("[Backend] Startup failed:", error);

    await Promise.allSettled([
      disconnectKafka(),
      disconnectRedis(),
      prisma.$disconnect(),
    ]);

    process.exit(1);
  }
};

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[Backend] Received ${signal}. Shutting down...`);

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await Promise.all([
      disconnectKafka(),
      disconnectRedis(),
      prisma.$disconnect(),
    ]);

    console.log("[Backend] Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("[Backend] Shutdown failed:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void startServer();
