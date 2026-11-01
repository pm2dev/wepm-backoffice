import { connection } from "next/server";
import { sessionFromRequest } from "@/server/auth";
import { errorJson, json } from "@/server/http";
import { loadWorkspace } from "@/server/store";

/** GET /api/data — the workspace's current business data (signed-in only, never cached). */
export async function GET(request: Request) {
  await connection(); // request-time only: never query the database during the build
  if (!sessionFromRequest(request)) return errorJson(401, "Please sign in.", "auth");
  try {
    const { data, version } = await loadWorkspace();
    return json({ data, version });
  } catch (e) {
    console.error("GET /api/data failed", e);
    return errorJson(500, "Couldn't load data from the database.");
  }
}
