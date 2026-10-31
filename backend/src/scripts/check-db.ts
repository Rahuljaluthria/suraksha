
import { prisma } from "../config/prisma.js";

async function checkDatabase(): Promise<void> {
  try {
    await prisma.$connect();

    const result = await prisma.$queryRaw<
      Array<{ result: number }>
    >`SELECT 1 AS result`;

    console.log("================================");
    console.log("       SURAKSHA DATABASE");
    console.log("================================");
    console.log("Connection: SUCCESS");
    console.log("Database: suraksha");
    console.log("Query result:", result[0]?.result);
    console.log("================================");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void checkDatabase();
