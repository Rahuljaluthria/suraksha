import { prisma } from "../config/prisma.js";
import { PERMISSIONS, ROLES, type RoleCode } from "../config/rbac.js";

// Read-only: compares the database with the catalogue in src/config/rbac.ts.
async function verify(): Promise<void> {
  const problems: string[] = [];

  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { code: "asc" },
  });
  const permissionCount = await prisma.permission.count();

  const expectedRoles = Object.keys(ROLES) as RoleCode[];
  const expectedPermissions = Object.keys(PERMISSIONS);

  for (const code of expectedRoles) {
    const role = roles.find((r) => r.code === code);
    if (!role) {
      problems.push(`Missing role ${code}`);
      continue;
    }
    if (!role.isSystem) problems.push(`Role ${code} is not flagged isSystem`);

    const actual = new Set(role.permissions.map((rp) => rp.permission.key));
    const expected = new Set<string>(ROLES[code].permissions);
    for (const key of expected) if (!actual.has(key)) problems.push(`${code} is missing ${key}`);
    for (const key of actual) if (!expected.has(key)) problems.push(`${code} has unexpected ${key}`);
  }

  if (permissionCount < expectedPermissions.length) {
    problems.push(`Expected at least ${expectedPermissions.length} permissions, found ${permissionCount}`);
  }

  console.log("================================");
  console.log("      SURAKSHA RBAC VERIFY");
  console.log("================================");
  console.log(`Roles in database:       ${roles.length} (expected ${expectedRoles.length})`);
  console.log(`Permissions in database: ${permissionCount} (expected ${expectedPermissions.length})`);
  console.log("");
  for (const role of roles) {
    console.log(`${role.code.padEnd(20)} ${String(role.permissions.length).padStart(2)} permissions`);
  }
  console.log("");

  if (problems.length > 0) {
    console.error("MISMATCHES:");
    for (const p of problems) console.error(` - ${p}`);
    process.exitCode = 1;
  } else {
    console.log("Result: database matches the catalogue.");
  }
  console.log("================================");
}

verify()
  .catch((error) => {
    console.error("RBAC verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
