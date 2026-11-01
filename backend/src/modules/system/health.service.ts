import { prisma } from "../../config/prisma.js";
import { redis } from "../../config/redis.js";
import { kafkaClient } from "../../config/kafka.js";

export type ServiceStatus = "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";
export type OverallStatus = "OPERATIONAL" | "DEGRADED" | "DOWN";

export interface ServiceHealth {
  key: "database" | "redis" | "kafka" | "eventPipeline" | "worker";
  label: string;
  status: ServiceStatus;
  latencyMs: number | null;
  /** Short, non-sensitive explanation. Never contains hosts, credentials or raw errors. */
  detail: string | null;
}

export interface SystemHealth {
  overall: OverallStatus;
  checkedAt: string;
  uptimeSeconds: number;
  services: ServiceHealth[];
}

const CHECK_TIMEOUT_MS = 2500;
const RESULT_TTL_MS = 10_000;
const STALE_PENDING_MS = 2 * 60 * 1000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function timed(
  key: ServiceHealth["key"],
  label: string,
  check: () => Promise<{ status: ServiceStatus; detail?: string | null }>
): Promise<ServiceHealth> {
  const start = performance.now();
  try {
    const result = await withTimeout(check(), CHECK_TIMEOUT_MS);
    return {
      key,
      label,
      status: result.status,
      latencyMs: Math.round(performance.now() - start),
      detail: result.detail ?? null,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "timeout";
    return {
      key,
      label,
      status: "DOWN",
      latencyMs: timedOut ? null : Math.round(performance.now() - start),
      detail: timedOut ? "Did not respond in time" : "Check failed",
    };
  }
}

const checkDatabase = () =>
  timed("database", "MySQL", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "UP" };
  });

const checkRedis = () =>
  timed("redis", "Redis", async () => {
    if (redis.status === "wait") await redis.connect();
    if (redis.status !== "ready") return { status: "DOWN", detail: "Not connected" };
    const reply = await redis.ping();
    return reply === "PONG" ? { status: "UP" } : { status: "DOWN", detail: "Unexpected reply" };
  });

const checkKafka = () =>
  timed("kafka", "Kafka", async () => {
    const admin = kafkaClient.admin();
    try {
      await admin.connect();
      await admin.describeCluster();
      return { status: "UP" };
    } finally {
      // Never let a hung disconnect delay the response.
      void admin.disconnect().catch(() => undefined);
    }
  });

const checkEventPipeline = () =>
  timed("eventPipeline", "Event pipeline", async () => {
    const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
    const [failed, stalePending] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: "FAILED" } }),
      prisma.outboxEvent.count({ where: { status: "PENDING", createdAt: { lt: staleBefore } } }),
    ]);
    if (failed > 0) {
      return { status: "DEGRADED", detail: `${failed} event(s) failed to publish and need attention` };
    }
    if (stalePending > 0) {
      return { status: "DEGRADED", detail: `${stalePending} event(s) waiting to publish for over 2 minutes` };
    }
    return { status: "UP", detail: "Outbox is clear" };
  });

/** The worker is a separate process and writes no heartbeat, so its state is genuinely unknown. */
const workerUnknown = (): ServiceHealth => ({
  key: "worker",
  label: "Event worker",
  status: "UNKNOWN",
  latencyMs: null,
  detail: "No worker heartbeat is recorded",
});

export function summarise(services: ServiceHealth[]): OverallStatus {
  const byKey = new Map(services.map((s) => [s.key, s.status]));
  if (byKey.get("database") === "DOWN") return "DOWN";
  const impaired = services.some(
    (s) => s.key !== "worker" && (s.status === "DOWN" || s.status === "DEGRADED")
  );
  return impaired ? "DEGRADED" : "OPERATIONAL";
}

let cached: { at: number; value: SystemHealth } | null = null;
let inFlight: Promise<SystemHealth> | null = null;

/**
 * Real dependency checks, cached briefly and coalesced so a busy dashboard cannot hammer
 * MySQL, Redis or Kafka with probes.
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  if (cached && Date.now() - cached.at < RESULT_TTL_MS) return cached.value;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const services = [
      ...(await Promise.all([checkDatabase(), checkRedis(), checkKafka(), checkEventPipeline()])),
      workerUnknown(),
    ];
    const value: SystemHealth = {
      overall: summarise(services),
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      services,
    };
    cached = { at: Date.now(), value };
    return value;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Test hook. */
export function resetSystemHealthCache(): void {
  cached = null;
}
