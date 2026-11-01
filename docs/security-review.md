# Security review — API and sign-in

Scope: everything the hosted app exposes — `src/proxy.ts`, `/api/auth/{login,logout,session}`, `/api/data`, `/api/ops` (all 26 operations), `/api/health` — plus the session, cookie and environment handling behind them. Each finding was reproduced against a running server before fixing, and re-tested after.

## Findings and fixes

| # | Finding | Severity | Fix | Verified |
|---|---|---|---|---|
| 1 | **Mass assignment / no input validation on `/api/ops`.** Request fields were spread into stored records: editing a bill with an injected `id` replaced its ID (orphaning its charges) and overwrote `createdOn`; unknown fields (`isAdmin`) and a 2 MB note were stored; invalid enums (`billingCadence: "hourly-ish"`) were accepted. | High | Strict per-operation schemas (`src/lib/data/operation-schemas.ts`, zod): unknown keys rejected, types/enums enforced, every string and array size-limited. The schemas are type-checked against the operations. Domain functions now build records from explicit field lists, so IDs and timestamps can't be overwritten even without the schema. The preview validates the same way (with the same JSON round trip). | Injected `id`/`isAdmin` → 400; unit tests |
| 2 | **Development tools on when `APP_ENV` is missing.** `resetToEmpty` (wipe all data) was allowed if the variable was unset — fail-open in production. | High | Only exactly `APP_ENV=development` enables them; anything else is production. Same for the UI (`NEXT_PUBLIC_APP_ENV`). | `APP_ENV` unset → 403 |
| 3 | **No cross-site request protection (CSRF).** Writes and sign-in from another origin, or as `text/plain` (an HTML-form-compatible "simple" request), were accepted. SameSite=Lax cookies help but don't cover same-site subdomains. | Medium | API writes (including sign-in and sign-out) are refused when `Origin` or `Sec-Fetch-Site` shows another site — in the proxy and again in each route. Bodies must be `application/json`. | evil Origin → 403, `text/plain` → 415, same-origin → 200 |
| 4 | **Sign-in rate limit bypass and memory growth.** The limiter trusted the client-controlled first `X-Forwarded-For` entry, so rotating it avoided the limit; the failure map could grow without bound. | Medium | Uses the address appended by the trusted proxy (last entry; `TRUSTED_PROXY_HOPS` to adjust). Expired entries are pruned, with a hard cap of 10,000. `Retry-After` header on 429. | 12 spoofed attempts → 429 |
| 5 | **No request size limits.** A 7 MB body was read and parsed in full. | Medium | Bodies are streamed with hard limits: 8 KB for sign-in, 6 MB for operations (CSV import is capped at 5 MB) → 413. Sign-in fields are truncated. | 7 MB → 413 |
| 6 | **No security headers** (clickjacking, MIME sniffing, no HSTS). | Medium | `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS; `X-Powered-By` removed. | Headers present on all routes |
| 7 | **API responses cacheable.** `/api/ops` and sign-in responses had no `Cache-Control`. | Low | All API responses (and the proxy's 401/403) send `Cache-Control: no-store`. | Header present |
| 8 | **Health check disclosed the environment.** Public `/api/health` returned `env` and the schema version. | Low | Returns only `status` and `database`. | — |
| 9 | **Cookie `Secure` flag depended on a client header** (`x-forwarded-proto`). | Low | `Secure` everywhere except plain-http `localhost`, decided from the URL. | Unit test |

## Checked and fine

- **SQL injection:** all raw SQL uses Prisma's parameterized tagged templates; everything else is the Prisma query API.
- **XSS:** React escapes all output; no `dangerouslySetInnerHTML`, `eval` or `new Function`. Imported CSV content is rendered as text.
- **Authentication:** credentials only from environment variables; constant-time comparison; same message for wrong username or password (no user enumeration); sessions HMAC-signed, expiring, and revoked by changing the password or `AUTH_SECRET`; tampered tokens rejected.
- **Authorization:** every page and API route except `/login`, `/api/auth/login` and `/api/health` requires a session — enforced in the proxy and again inside `/api/data` and `/api/ops`. Server-only operations (QuickBooks sync) are refused from the browser.
- **Open redirect:** the post-sign-in `next` parameter accepts same-site paths only.
- **Error handling:** unexpected errors are logged server-side; clients get a generic message.
- **CORS:** no CORS headers, so other sites can't read API responses.
- **Concurrency:** each change runs in a transaction with a row lock.
- **Dependencies:** `npm audit` — 0 known vulnerabilities.

## Accepted for now (revisit before real data in production)

- **Sessions can't be revoked one at a time.** Signing out clears the cookie, but a copied cookie stays valid until it expires (7 days). Rotating `AUTH_SECRET` signs out everyone. A server-side session table would allow per-session revocation.
- **Rate limiting is in memory**, so it resets on redeploy and isn't shared between instances (the app runs one instance).
- **Single shared login, no 2FA.** Use a strong, unique password in production; consider passkeys or an identity provider.
- **No script-src Content-Security-Policy** (Next.js uses inline bootstrap scripts; a nonce-based policy is possible later).
- **The client IP for rate limiting assumes one trusted proxy** in front of the app (Railway's edge). If limits seem to apply to everyone at once, set `TRUSTED_PROXY_HOPS`.
- **Not yet built:** the QuickBooks/Slashbin webhook endpoint must verify signatures and only accept the configured QuickBooks company (see `integrations.md`).
