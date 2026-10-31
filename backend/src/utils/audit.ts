import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

export interface CreateAuditLogParams {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Creates an immutable audit record in the database.
 * Supports both global prisma client and transaction client (tx).
 */
export async function createAuditLog(
  params: CreateAuditLogParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { auditLog: { create: (args: any) => Promise<any> } } = prisma
): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        actorId: params.actorId || undefined,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        ipAddress: params.ipAddress ? params.ipAddress.slice(0, 45) : undefined,
        userAgent: params.userAgent ? params.userAgent.slice(0, 500) : undefined,
        metadata: params.metadata,
      },
    });
  } catch (error) {
    console.error("[AuditLog] Failed to create audit log:", error);
  }
}
