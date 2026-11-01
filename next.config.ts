import { existsSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 builds a static site (GitHub Pages preview of the sample-data
 * prototype). BASE_PATH sets the URL prefix, e.g. "/wepm-backoffice".
 * Without STATIC_EXPORT the app builds for a normal Node server.
 */
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.BASE_PATH || undefined;

/**
 * Security headers for the hosted app. (GitHub Pages can't send custom headers;
 * that preview holds sample data only.) No script-src policy: Next.js relies
 * on inline bootstrap scripts, and the app renders no user HTML.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/**
 * Per-build deployment ID (written by `npm run build`). With it, a browser tab
 * left open from an older deploy reloads itself on its next page change
 * instead of running old code, and the app can tell the user an update is
 * available. Not used for the static GitHub Pages preview.
 */
const deploymentIdFile = new URL("./.deployment-id", import.meta.url);
const deploymentId = !staticExport && existsSync(deploymentIdFile) ? readFileSync(deploymentIdFile, "utf8").trim() : undefined;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  deploymentId,
  env: { NEXT_PUBLIC_DEPLOYMENT_ID: deploymentId ?? "" },
  ...(staticExport
    ? {}
    : {
        headers: async () => [
          { source: "/:path*", headers: securityHeaders },
          // Pages: always revalidate so no browser, proxy or CDN serves a page from an old deploy.
          // (Hashed files under /_next/static stay cached long-term; their names change every build.)
          { source: "/((?!_next/static|_next/image|favicon.ico|api/).*)", headers: [{ key: "Cache-Control", value: "no-cache" }] },
        ],
      }),
  // Cache Components / partial prerendering are off: every page loads its data
  // in the browser, so they add nothing, and they would keep previously visited
  // pages mounted (hidden) and try to prerender API routes during the build.
  // The static preview has no server: API route files (route.ts) are left out by
  // only treating .tsx files as app routes in that build.
  ...(staticExport ? { output: "export", trailingSlash: true, images: { unoptimized: true }, pageExtensions: ["tsx"] } : {}),
  basePath,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
