import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Proxy backend API calls to FastAPI (port 8000).
    // Everything under /api/* goes to the backend EXCEPT /api/report/*,
    // which is a Next.js route handler (PDF generation).
    const backend = "http://localhost:8000";
    const prefixes = [
      "system",
      "auth",
      "activity",
      "settings",
      "users",
      "roles",
      "ldap",
      "apps",
      "scans",
      "tags",
      "findings",
      "scanners",
      "import-scan",
      "apikeys",
    ];
    return [
      ...prefixes.map((p) => ({
        source: `/api/${p}/:path*`,
        destination: `${backend}/api/${p}/:path*`,
      })),
      // Bare paths (no trailing segments) for the list/collection endpoints.
      ...prefixes.map((p) => ({
        source: `/api/${p}`,
        destination: `${backend}/api/${p}`,
      })),
      {
        source: "/api/health",
        destination: `${backend}/api/health`,
      },
      // FastAPI interactive API docs (Swagger UI, ReDoc, OpenAPI schema).
      { source: "/docs", destination: `${backend}/docs` },
      { source: "/docs/:path*", destination: `${backend}/docs/:path*` },
      { source: "/redoc", destination: `${backend}/redoc` },
      { source: "/openapi.json", destination: `${backend}/openapi.json` },
    ];
  },
};

export default nextConfig;
