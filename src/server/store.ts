import "server-only";
import { applyOperation, type OperationArgs, type OperationName, type OperationResult } from "@/lib/data/operations";
import { migrateData, MigrationError } from "@/lib/data/migrations";
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

type Tx = Prisma.TransactionClient;

function upgrade(stored: unknown, schemaVersion: number) {
  try {
    return migrateData(stored, schemaVersion);
  } catch (e) {
    if (e instanceof MigrationError) throw new StoreError(e.message);
    throw e;
  }
}

/**
 * Lock the workspace row and, if its data is from an older schema version,
 * upgrade it in place: the upgraded data is saved as a new version with a
 * "migrate" entry in the change history.
 */
async function lockCurrent(tx: Tx): Promise<{ data: BackofficeData; version: number }> {
  const rows = await tx.$queryRaw<{ data: unknown; version: number; schemaVersion: number }[]>`
    SELECT "data", "version", "schemaVersion" FROM "Workspace" WHERE "id" = ${WORKSPACE_ID} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new StoreError("Workspace not found.");
  const { data, from, to, migrated } = upgrade(row.data, row.schemaVersion);
  if (!migrated) return { data, version: row.version };
  const version = row.version + 1;
  await tx.workspace.update({
    where: { id: WORKSPACE_ID },
    data: { version, schemaVersion: to, data: data as unknown as Prisma.InputJsonValue },
  });
  await tx.workspaceEvent.create({
    data: { workspaceId: WORKSPACE_ID, version, operation: "migrate", args: { from, to }, businessDate: null },
  });
  return { data, version };
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
  if (row.schemaVersion !== SCHEMA_VERSION) return prisma.$transaction(lockCurrent);
  return { data: upgrade(row.data, row.schemaVersion).data, version: row.version };
}

/**
 * Apply one operation atomically: lock the workspace row, run the shared
 * business rules, save the new version, and append to the change history.
 * If the rules reject the change, nothing is written.
 */
export async function runOperation<K extends OperationName>(op: K, args: OperationArgs<K>): Promise<{ result: OperationResult<K>; version: number }> {
  await loadWorkspace(); // ensure it exists
  return db().$transaction(async (tx) => {
    const current = await lockCurrent(tx);
    const { data, result } = applyOperation(current.data, op, args);
    const version = current.version + 1;
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
