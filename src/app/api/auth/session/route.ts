import { connection } from "next/server";
import { sessionFromRequest } from "@/server/auth";
import { json } from "@/server/http";

/** GET /api/auth/session — who is signed in (for the navigation). */
export async function GET(request: Request) {
  await connection();
  const s = sessionFromRequest(request);
  return json({ username: s?.u ?? null }, { status: s ? 200 : 401 });
}
