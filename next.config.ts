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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(staticExport ? {} : { headers: async () => [{ source: "/:path*", headers: securityHeaders }] }),
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
