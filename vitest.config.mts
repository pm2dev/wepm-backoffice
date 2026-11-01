import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // The "server-only" guard throws outside a Next.js server; tests run server code directly.
      "server-only": path.resolve(import.meta.dirname, "src/test/empty-module.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
