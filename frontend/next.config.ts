import type { NextConfig } from "next";

/**
 * The browser only ever talks to this Next.js app. Every /api/* request (including sign-in at
 * /api/auth/*) is proxied to the separate backend service, so the session cookie stays first-party
 * both locally and on Vercel.
 */
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
