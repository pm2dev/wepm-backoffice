import { connection } from "next/server";
import { db } from "@/server/db";
import { json } from "@/server/http";

/** GET /api/health — Railway's health check. Public, so it reveals nothing beyond up/down. */
export async function GET() {
  await connection(); // request-time only: never query the database during the build
  try {
    await db().$queryRaw`SELECT 1`;
    return json({ status: "ok", database: "ok" });
  } catch (e) {
    console.error("Health check: database unreachable", e);
    return json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
