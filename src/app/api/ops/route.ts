import { parseOperationArgs } from "@/lib/data/operation-schemas";
import { DEVELOPMENT_ONLY_OPERATIONS, isOperationName, SERVER_ONLY_OPERATIONS, serializeError, type OperationName } from "@/lib/data/operations";
import { sessionFromRequest } from "@/server/auth";
import { appEnv } from "@/server/db";
import { errorJson, isCrossSite, json, OPS_MAX_BYTES, readJson } from "@/server/http";
import { runOperation } from "@/server/store";

/**
 * POST /api/ops — run one named operation against the database.
 * Body: { op: string, args: object }. Args are validated against a strict
 * schema per operation before any business rule runs. Business-rule errors
 * come back as 422 with the same messages the forms show.
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return errorJson(403, "Cross-site request refused.", "auth");
  if (!sessionFromRequest(request)) return errorJson(401, "Please sign in.", "auth");
  const body = await readJson(request, OPS_MAX_BYTES);
  if (!body.ok) return body.response;
  const { op, args } = (body.value ?? {}) as { op?: unknown; args?: unknown };
  if (typeof op !== "string" || !isOperationName(op)) return errorJson(400, "Unknown operation.");
  if (SERVER_ONLY_OPERATIONS.includes(op)) return errorJson(403, "Not allowed from the app.");
  if (DEVELOPMENT_ONLY_OPERATIONS.includes(op) && appEnv() !== "development") {
    return errorJson(403, "Only available in the development environment.");
  }
  const parsed = parseOperationArgs(op as OperationName, args);
  if (!parsed.ok) return errorJson(400, `Invalid request (${parsed.reason}).`);
  try {
    const { result, version } = await runOperation(op as OperationName, parsed.args);
    return json({ result, version });
  } catch (e) {
    const known = serializeError(e);
    if (known) return json({ error: known }, { status: 422 });
    console.error(`POST /api/ops ${op} failed`, e);
    return errorJson(500, "Something went wrong on the server. Nothing was changed.");
  }
}
