import type { NextConfig } from "next";

// The browser only ever talks to this app. /api/* is proxied to the Express API, so the
// session cookie is first-party and there's no CORS to manage.
// Set by scripts/next-with-root-env.cjs from the ports in the root package.json.
const API = process.env.API_INTERNAL_URL ?? "http://localhost:6061";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
};

export default nextConfig;
