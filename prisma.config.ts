// Prisma 7 configuration. DATABASE_URL comes from the environment (Railway
// injects it from the Postgres service) or a local .env file.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
