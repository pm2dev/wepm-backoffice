import { sessionFromRequest } from "@/server/auth";
import { connection } from "next/server";
import { loadWorkspace } from "@/server/store";

/** GET /api/data — the workspace's current business data. */
export async function GET(request: Request) {
  await connection(); // request-time only: never query the database during the build
  if (!sessionFromRequest(request)) return Response.json({ error: { kind: "auth", message: "Please sign in." } }, { status: 401 });
  try {
    const { data, version } = await loadWorkspace();
    return Response.json({ data, version }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("GET /api/data failed", e);
    return Response.json({ error: { kind: "domain", message: "Couldn't load data from the database." } }, { status: 500 });
  }
}
