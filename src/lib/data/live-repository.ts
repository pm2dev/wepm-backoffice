import type { BackofficeData } from "@/lib/domain/types";
import { deserializeError, type OperationArgs, type OperationName, type OperationResult, type SerializedError } from "./operations";
import { BackofficeRepository } from "./repository";

export class ApiError extends Error {}

function toLogin(): never {
  if (typeof window !== "undefined") {
    const here = window.location.pathname + window.location.search;
    // Full reload on purpose: resets in-memory data before signing in again.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(here)}`);
  }
  throw new ApiError("Your session has ended. Please sign in again.");
}

/** Live repository: the server applies operations to Postgres. */
export class LiveRepository extends BackofficeRepository {
  readonly mode = "live" as const;
  constructor(
    private readonly basePath: string,
    readonly devTools: boolean,
  ) {
    super();
  }

  async load(): Promise<BackofficeData> {
    const res = await fetch(`${this.basePath}/api/data`, { cache: "no-store" });
    if (res.status === 401) toLogin();
    if (!res.ok) throw new ApiError(`Couldn't load data from the server (${res.status}).`);
    return ((await res.json()) as { data: BackofficeData }).data;
  }

  protected async run<K extends OperationName>(op: K, args: OperationArgs<K>): Promise<OperationResult<K>> {
    let res: Response;
    try {
      res = await fetch(`${this.basePath}/api/ops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, args }),
      });
    } catch {
      throw new ApiError("Couldn't reach the server. Check your connection and try again; nothing was saved.");
    }
    if (res.status === 401) toLogin();
    const body = (await res.json().catch(() => null)) as { result?: OperationResult<K>; error?: SerializedError } | null;
    if (body?.error) throw deserializeError(body.error);
    if (!res.ok || !body) throw new ApiError(`The server couldn't save this (${res.status}). Nothing was changed.`);
    return body.result as OperationResult<K>;
  }
}
