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

   `NEXT_PUBLIC_*` values are baked in at build time — redeploy after changing them.
6. **Give it a URL.** `backoffice` → **Settings → Networking → Generate Domain**.
7. **Deploy and check.** Open `https://<your-domain>/api/health` — it should show `{"status":"ok","env":"development","database":"ok",…}`. Then open the app: an amber **Development environment** banner shows at the top, and the data starts as the sample set.

## How it behaves

- **Migrations** run automatically at the start of each deploy (`prisma migrate deploy`). If one fails, the new version doesn't start and the previous one keeps serving.
- **Health check:** Railway waits for `/api/health` (which also checks the database) before switching traffic to a new deploy.
- **Development tools** (Development controls in the banner): set the business date, reload the sample data, or start empty. Simulated QuickBooks payments are allowed. The server refuses all of these when `APP_ENV=production`.
- **History:** every change is recorded in the `WorkspaceEvent` table (operation, input, business date, time), alongside the current data in `Workspace`.

## Before production holds real data

- **Sign-in.** There is no authentication yet, by request. Anyone with the URL can view and change data — fine for sample data in development, **not** for real business data. Add owner sign-in before entering real data in production.
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
