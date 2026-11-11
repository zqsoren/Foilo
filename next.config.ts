import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [
      { source: "/todo/dashboard/login", destination: "/login", permanent: true },
      // Earlier releases sent a cacheable 308 in the opposite direction.
      { source: "/dashboard", destination: "/todo/dashboard?_folio_moved=1", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/todo-sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/todo.webmanifest", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
