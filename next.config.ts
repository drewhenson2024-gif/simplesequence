import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "@libsql/client/web"],
  agentRules: false,
};

export default nextConfig;
