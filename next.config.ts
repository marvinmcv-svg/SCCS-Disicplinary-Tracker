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
};

export default nextConfig;
