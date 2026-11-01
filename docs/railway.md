# Hosting on Railway

One Railway **project** with two **environments** — `development` and `production`. Each environment has its own copy of two services:

| Service | What it is |
|---|---|
| **Postgres** | Railway's PostgreSQL database |
| **backoffice** | This repository (Next.js server) |

The repo already contains what Railway needs: `railway.json` (build, start, health check), `npm run build` (generates the Prisma client and builds), and `npm run start:prod` (applies database migrations, then starts the server). Node 22.12+ is declared in `package.json`.

## Set up the development environment

1. **Create the project.** In Railway: **New Project → Deploy from GitHub repo → `pm2dev/wepm-backoffice`**. Railway creates the `backoffice` service. Don't worry if the first deploy fails — it has no database yet.
2. **Create the `development` environment.** Use the environment switcher at the top of the project → **New Environment** → name it `development` (duplicating the production setup is fine). Do the remaining steps *in the development environment*.
3. **Add a database.** **+ Create → Database → PostgreSQL.** Name it `Postgres`.
4. **Pick the branch.** `backoffice` service → **Settings → Source → Branch** → `develop`. Every push to `develop` redeploys the dev environment.
5. **Set variables.** `backoffice` service → **Variables**:

   | Variable | development | production (later) |
   |---|---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | `${{Postgres.DATABASE_URL}}` |
   | `APP_ENV` | `development` | `production` |
   | `NEXT_PUBLIC_DATA_MODE` | `live` | `live` |
   | `NEXT_PUBLIC_APP_ENV` | `development` | `production` |
   | `AUTH_USERNAME` | your sign-in username | a different username |
   | `AUTH_PASSWORD` | your sign-in password | a different, strong password |
   | `AUTH_SECRET` | 64 random characters | different 64 random characters |

   Sign-in is refused until all three `AUTH_*` values are set (`AUTH_SECRET` must be at least 32 characters). Changing `AUTH_PASSWORD` or `AUTH_SECRET` signs everyone out. Use different values in each environment, and never commit them.

   `NEXT_PUBLIC_*` values are baked in at build time — redeploy after changing them.
6. **Give it a URL.** `backoffice` → **Settings → Networking → Generate Domain**.
7. **Deploy and check.** Open `https://<your-domain>/api/health` — it should show `{"status":"ok","database":"ok"}` (the health check doesn't require signing in). Then open the app: you're sent to **Sign in**; after signing in, an amber **Development environment** banner shows at the top, and the data starts as the sample set.

## How it behaves

- **Migrations** run automatically at the start of each deploy (`prisma migrate deploy`). If one fails, the new version doesn't start and the previous one keeps serving.
- **Health check:** Railway waits for `/api/health` (which also checks the database) before switching traffic to a new deploy.
- **Security:** see [security-review.md](security-review.md). `APP_ENV` must be exactly `development` to enable development tools; anything else (including unset) is treated as production.
- **Sign-in** protects every page and API route except `/login` and `/api/health`. Signed-out visitors are sent to `/login` and returned to the page they asked for afterwards.
- **Development tools** (Development controls in the banner): set the business date, reload the sample data, or start empty. Simulated QuickBooks payments are allowed. The server refuses all of these when `APP_ENV=production`.
- **History:** every change is recorded in the `WorkspaceEvent` table (operation, input, business date, time), alongside the current data in `Workspace`.

## Before production holds real data

- **Sign-in.** There is one owner login from the `AUTH_*` variables, with signed, HttpOnly session cookies (7 days), a sign-in page, sign-out, and a limit of 10 failed attempts per IP per 15 minutes. The current username/password are meant to be temporary: before production holds real data, set a strong password (or move to a proper identity provider / passkeys) and consider two-factor sign-in.
- **Backups.** Turn on Railway's Postgres backups for the production database.
- **Integrations.** The Slashbin/QuickBooks webhook endpoints and the read-only QuickBooks connection are not built yet (see `integrations.md`).

## Local development against Postgres

```bash
cp .env.example .env          # point DATABASE_URL at a local Postgres
npm install                   # also generates the Prisma client
npm run db:migrate            # create/apply migrations
npm run dev                   # http://localhost:3000
```

Schema changes: edit `prisma/schema.prisma`, run `npm run db:migrate -- --name <change>`, and commit the new folder under `prisma/migrations/`.
