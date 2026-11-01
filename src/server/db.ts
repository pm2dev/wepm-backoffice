import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** One Prisma client (and connection pool) per server process. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set.");
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return globalForPrisma.prisma;
}

/**
 * "development" | "production" — server-side environment, set per Railway
 * environment. Fails closed: anything other than exactly "development"
 * (including a missing variable) is treated as production, so development
 * tools can never be switched on by accident.
 */
export function appEnv(): "development" | "production" {
  return process.env.APP_ENV === "development" ? "development" : "production";
}
