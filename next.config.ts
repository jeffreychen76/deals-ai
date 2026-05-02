import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ["mammoth", "pdf-parse"]
};

export default nextConfig;
