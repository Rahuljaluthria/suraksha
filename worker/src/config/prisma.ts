import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const parsedUrl = new URL(databaseUrl);

if (parsedUrl.protocol !== "mysql:") {
  throw new Error("DATABASE_URL must use the mysql protocol");
}

const database = parsedUrl.pathname.replace(/^\/+/, "");

if (!database || !parsedUrl.hostname || !parsedUrl.username) {
  throw new Error("DATABASE_URL is missing required connection details");
}

const adapter = new PrismaMariaDb({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port || 3306),
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database,
  connectionLimit: 5,
});

export const prisma = new PrismaClient({ adapter });

