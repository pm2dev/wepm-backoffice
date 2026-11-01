import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 builds a static site (GitHub Pages preview of the sample-data
 * prototype). BASE_PATH sets the URL prefix, e.g. "/wepm-backoffice".
 * Without STATIC_EXPORT the app builds for a normal Node server.
 */
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.BASE_PATH || undefined;

const nextConfig: NextConfig = {
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
