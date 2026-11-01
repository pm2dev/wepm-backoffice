import { connection } from "next/server";
import { SCHEMA_VERSION } from "@/lib/domain/empty";
import { appEnv, db } from "@/server/db";

/** GET /api/health — used by Railway's health check. Verifies the database is reachable. */
export async function GET() {
  await connection(); // request-time only: never query the database during the build
  try {
    await db().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", env: appEnv(), database: "ok", schemaVersion: SCHEMA_VERSION }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("Health check: database unreachable", e);
    return Response.json({ status: "error", env: appEnv(), database: "unreachable" }, { status: 503 });
  }
}
