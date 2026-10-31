
import Redis from "ioredis";

const redisPassword = process.env.REDIS_PASSWORD;

if (!redisPassword) {
  throw new Error("REDIS_PASSWORD is not configured");
}

export const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: redisPassword,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on("connect", () => {
  console.log("[Redis] Connecting...");
});

redis.on("ready", () => {
  console.log("[Redis] Connection ready");
});

redis.on("error", (error) => {
  console.error("[Redis] Connection error:", error.message);
});

redis.on("close", () => {
  console.log("[Redis] Connection closed");
});

export const connectRedis = async (): Promise<void> => {
  if (redis.status === "wait") {
    await redis.connect();
  }

  const response = await redis.ping();

  if (response !== "PONG") {
    throw new Error("Redis health check failed");
  }

  console.log("[Redis] Health check successful");
};

export const disconnectRedis = async (): Promise<void> => {
  if (redis.status !== "end") {
    await redis.quit();
  }
};
