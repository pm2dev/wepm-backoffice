import "server-only";
import { applyOperation, type OperationArgs, type OperationName, type OperationResult } from "@/lib/data/operations";
import { buildSampleData } from "@/lib/data/sample-fixtures";
import { emptyData, SCHEMA_VERSION } from "@/lib/domain/empty";
import type { BackofficeData } from "@/lib/domain/types";
import type { Prisma } from "@/generated/prisma/client";
import { appEnv, db } from "./db";

export const WORKSPACE_ID = "main";

export class StoreError extends Error {}

function initialData(): BackofficeData {
  // Development starts with the sample set so the app can be tried right away;
  // production starts empty.
  return appEnv() === "development" ? buildSampleData() : emptyData();
}

function checkShape(schemaVersion: number) {
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new StoreError(`Stored data is schema version ${schemaVersion}, but this build expects ${SCHEMA_VERSION}. A data migration is required.`);
  }
}

/** Read the workspace, creating it on first use. */
export async function loadWorkspace(): Promise<{ data: BackofficeData; version: number }> {
  const prisma = db();
  let row = await prisma.workspace.findUnique({ where: { id: WORKSPACE_ID } });
  if (!row) {
    // Atomic create: concurrent first requests can't both insert.
    const data = JSON.stringify(initialData());
    await prisma.$executeRaw`
      INSERT INTO "Workspace" ("id", "version", "schemaVersion", "data", "updatedAt")
      VALUES (${WORKSPACE_ID}, 0, ${SCHEMA_VERSION}, ${data}::jsonb, NOW())
      ON CONFLICT ("id") DO NOTHING`;
    row = await prisma.workspace.findUniqueOrThrow({ where: { id: WORKSPACE_ID } });
  }
  checkShape(row.schemaVersion);
  return { data: row.data as unknown as BackofficeData, version: row.version };
}

/**
 * Apply one operation atomically: lock the workspace row, run the shared
 * business rules, save the new version, and append to the change history.
 * If the rules reject the change, nothing is written.
 */
export async function runOperation<K extends OperationName>(op: K, args: OperationArgs<K>): Promise<{ result: OperationResult<K>; version: number }> {
  await loadWorkspace(); // ensure it exists
  return db().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ data: unknown; version: number; schemaVersion: number }[]>`
      SELECT "data", "version", "schemaVersion" FROM "Workspace" WHERE "id" = ${WORKSPACE_ID} FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new StoreError("Workspace not found.");
    checkShape(row.schemaVersion);
    const { data, result } = applyOperation(row.data as BackofficeData, op, args);
    const version = row.version + 1;
    await tx.workspace.update({
      where: { id: WORKSPACE_ID },
      data: { version, schemaVersion: SCHEMA_VERSION, data: data as unknown as Prisma.InputJsonValue },
    });
    const today = (args as { today?: unknown }).today;
    await tx.workspaceEvent.create({
      data: {
        workspaceId: WORKSPACE_ID,
        version,
        operation: op,
        args: (args ?? {}) as Prisma.InputJsonValue,
        businessDate: typeof today === "string" ? today : null,
      },
    });
    return { result, version };
  });
}
