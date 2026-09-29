import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Scan reports (e.g. a Trivy image scan of a full base image) can be tens of
  // MB. The proxy buffers the request body and defaults to a 10MB cap, which
  // truncated large /api/import-scan uploads and reset the connection (502/500).
  // Raise it so big reports proxy through to the backend intact.
  experimental: {
    proxyClientMaxBodySize: "256mb",
  },
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
      "scan-summary",
      "apikeys",
      "certificates",
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
