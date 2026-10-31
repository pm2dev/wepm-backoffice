import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 builds a static site (GitHub Pages preview of the sample-data
 * prototype). BASE_PATH sets the URL prefix, e.g. "/wepm-backoffice".
 * Without STATIC_EXPORT the app builds for a normal Node server.
 */
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.BASE_PATH || undefined;

const nextConfig: NextConfig = {
  // Partial prerendering needs a server, so it is off for the static export.
  cacheComponents: !staticExport,
  partialPrefetching: !staticExport,
  ...(staticExport ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {}),
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
