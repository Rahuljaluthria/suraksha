import { prisma } from "../config/prisma.js";
import { PERMISSIONS, ROLES, type PermissionKey, type RoleCode } from "../config/rbac.js";

const permissionEntries = Object.entries(PERMISSIONS) as Array<[PermissionKey, string]>;
const roleEntries = Object.entries(ROLES) as Array<[RoleCode, (typeof ROLES)[RoleCode]]>;

async function seed(): Promise<void> {
  const summary = await prisma.$transaction(async (tx) => {
    const permissionIdByKey = new Map<string, string>();
    for (const [key, description] of permissionEntries) {
      const permission = await tx.permission.upsert({
        where: { key },
        update: { description },
        create: { key, description },
      });
      permissionIdByKey.set(key, permission.id);
    }

    let linksCreated = 0;
    let linksPruned = 0;
    const roleIdByCode = new Map<string, string>();

    for (const [code, definition] of roleEntries) {
      const role = await tx.role.upsert({
        where: { code },
        update: { name: definition.name, description: definition.description, isSystem: true },
        create: {
          code,
          name: definition.name,
          description: definition.description,
          isSystem: true,
        },
      });
      roleIdByCode.set(code, role.id);

      const wanted = definition.permissions.map((key) => {
        const id = permissionIdByKey.get(key);
        if (!id) throw new Error(`Role ${code} references unknown permission ${key}`);
        return id;
      });

      // The catalogue is authoritative for system roles: drop grants it no longer
      // contains so revoking a permission in code also revokes it in the database.
      const pruned = await tx.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wanted } },
      });
      linksPruned += pruned.count;

      const created = await tx.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
      linksCreated += created.count;
    }

    const knownPermissionKeys = permissionEntries.map(([key]) => key);
    const strayPermissions = await tx.permission.findMany({
      where: { key: { notIn: knownPermissionKeys } },
      select: { key: true },
    });

    return { linksCreated, linksPruned, strayPermissions: strayPermissions.map((p) => p.key) };
  });

  const totalLinks = roleEntries.reduce((n, [, r]) => n + r.permissions.length, 0);

  console.log("================================");
  console.log("       SURAKSHA RBAC SEED");
  console.log("================================");
  console.log(`Roles seeded:                ${roleEntries.length}`);
  console.log(`Permissions seeded:          ${permissionEntries.length}`);
  console.log(`Role-permission links:       ${totalLinks} (${summary.linksCreated} new, ${summary.linksPruned} removed)`);
  if (summary.strayPermissions.length > 0) {
    console.warn(
      `Warning: permissions in the database but not in the catalogue (left untouched): ${summary.strayPermissions.join(", ")}`,
    );
  }
  console.log("================================");
}

seed()
  .catch((error) => {
    console.error("RBAC seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
