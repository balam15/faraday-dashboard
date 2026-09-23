import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      // Proxy backend API calls to FastAPI (port 8000)
      // Exclude /api/report/* which is handled by Next.js itself
      {
        source: "/api/system/:path*",
        destination: "http://localhost:8000/api/system/:path*",
      },
      {
        source: "/api/auth/:path*",
        destination: "http://localhost:8000/api/auth/:path*",
      },
      {
        source: "/api/users/:path*",
        destination: "http://localhost:8000/api/users/:path*",
      },
      {
        source: "/api/ldap/:path*",
        destination: "http://localhost:8000/api/ldap/:path*",
      },
      {
        source: "/api/health",
        destination: "http://localhost:8000/api/health",
      },
    ];
  },
};

export default nextConfig;
