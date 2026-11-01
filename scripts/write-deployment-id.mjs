// Writes a unique ID for this build to .deployment-id. next.config.ts reads it
// both during `next build` and `next start`, so the build and the running
// server always agree (a value computed separately at each step would not).
import { writeFileSync } from "node:fs";

const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || "local").slice(0, 12);
const id = `${sha}-${Date.now().toString(36)}`;
writeFileSync(new URL("../.deployment-id", import.meta.url), id);
console.log(`Deployment ID: ${id}`);
