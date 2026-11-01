/**
 * Shared HTTP safeguards for API routes (and the proxy).
 */

export type ApiErrorBody = { error: { kind: string; message: string } };

/** JSON response that is never cached (business data, auth state). */
export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function errorJson(status: number, message: string, kind = "domain"): Response {
  return json({ error: { kind, message } } satisfies ApiErrorBody, { status });
}

/** The site's own origin as the browser sees it (Railway sets Host / X-Forwarded-Host). */
function expectedHost(request: Request): string | null {
  return request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
}

/**
 * Cross-site request forgery guard for state-changing requests. Browsers send
 * Origin and Sec-Fetch-Site on POSTs; a mismatch means another site is
 * submitting with the owner's cookie. Non-browser clients send neither and
 * can't ride the owner's cookie, so they pass this check (sign-in still applies).
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === "null") return true;
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return true;
    }
    if (host !== expectedHost(request)) return true;
  }
  return false;
}

/**
 * Read a JSON body with a hard size limit, without buffering more than the
 * limit. Requires `content-type: application/json` — HTML forms and other
 * "simple" cross-site requests can't send that without a CORS preflight.
 */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(type)) return { ok: false, response: errorJson(415, "Requests must be JSON.") };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, response: errorJson(413, "Request is too large.") };
  if (!request.body) return { ok: false, response: errorJson(400, "Invalid request.") };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, response: errorJson(413, "Request is too large.") };
    }
    chunks.push(value);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, response: errorJson(400, "Invalid request.") };
  }
}

/** Limits: sign-in bodies are tiny; operations allow a 5 MB CSV import plus overhead. */
export const LOGIN_MAX_BYTES = 8 * 1024;
export const OPS_MAX_BYTES = 6 * 1024 * 1024;
