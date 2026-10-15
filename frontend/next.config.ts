import type { NextConfig } from "next";

/**
 * The browser only ever talks to this Next.js app. Every /api/* request (including sign-in at
 * /api/auth/*) is proxied to the separate backend service, so the session cookie stays first-party
 * both locally and on Vercel.
 */
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/$/, "");

const isProd = process.env.NODE_ENV === "production";

/** Baseline security headers on every page (CSP is limited to framing so Mermaid/inline styles keep working). */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // AI drafts on a CPU-only local model (Ollama) can take 60–150 s; the rewrite proxy defaults to 30 s.
    proxyTimeout: 180_000,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/backlog", destination: "/tasks", permanent: false },
      { source: "/learning", destination: "/learnings", permanent: false },
      { source: "/learning/:id", destination: "/learnings/:id", permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
