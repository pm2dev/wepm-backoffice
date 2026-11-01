import { DEVELOPMENT_ONLY_OPERATIONS, isOperationName, SERVER_ONLY_OPERATIONS, serializeError, type OperationArgs, type OperationName } from "@/lib/data/operations";
import { appEnv } from "@/server/db";
import { runOperation } from "@/server/store";

/**
 * POST /api/ops — run one named operation against the database.
 * Body: { op: string, args: object }. Business-rule errors come back as 422
 * with the same messages the forms show.
 */
export async function POST(request: Request) {
  let body: { op?: unknown; args?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { kind: "domain", message: "Invalid request." } }, { status: 400 });
  }
  const op = typeof body.op === "string" ? body.op : "";
  if (!isOperationName(op)) return Response.json({ error: { kind: "domain", message: "Unknown operation." } }, { status: 400 });
  if (SERVER_ONLY_OPERATIONS.includes(op)) return Response.json({ error: { kind: "domain", message: "Not allowed from the app." } }, { status: 403 });
  if (DEVELOPMENT_ONLY_OPERATIONS.includes(op) && appEnv() !== "development") {
    return Response.json({ error: { kind: "domain", message: "Only available in the development environment." } }, { status: 403 });
  }
  if (typeof body.args !== "object" || body.args === null || Array.isArray(body.args)) {
    return Response.json({ error: { kind: "domain", message: "Invalid request." } }, { status: 400 });
  }
  try {
    const { result, version } = await runOperation(op as OperationName, body.args as OperationArgs<OperationName>);
    return Response.json({ result, version });
  } catch (e) {
    const known = serializeError(e);
    if (known) return Response.json({ error: known }, { status: 422 });
    console.error(`POST /api/ops ${op} failed`, e);
    return Response.json({ error: { kind: "domain", message: "Something went wrong on the server. Nothing was changed." } }, { status: 500 });
  }
}
