import type { NextConfig } from "next";
import { browserSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Keep development from generating unrelated repository instruction files.
  agentRules: false,
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: browserSecurityHeaders }];
  },
};

export default nextConfig;
