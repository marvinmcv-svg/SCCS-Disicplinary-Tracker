import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Never bundle the SQLite file into the build: the server must open the
  // live <project root>/db/sccs.db (see src/lib/db.ts), not a snapshot.
  outputFileTracingExcludes: {
    "*": ["db/**"],
  },
  /* config options here */
  reactStrictMode: false,
};

export default nextConfig;
