import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Ship the build-time seeded SQLite file with every API function (used by
  // the Vercel demo deployment, see src/lib/db.ts).
  outputFileTracingIncludes: {
    "/api/**/*": ["./db/sccs.db"],
  },
  // The service worker must never be served stale, or installed apps would
  // keep running an old version after a deploy.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
