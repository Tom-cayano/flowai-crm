import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Server-only packages (not bundled by webpack) ──────────────────────────
  // sharp must run in Node.js — never the edge runtime or browser bundle.
  serverExternalPackages: [
    "sharp",
    "ioredis",  // native net/tls — cannot be webpack-bundled
    "bullmq",   // depends on ioredis
  ],

  // ── Remote image domains (Next.js <Image> optimisation) ──────────────────
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname:  "*.supabase.co",
        pathname:  "/storage/v1/object/public/**",
      },
    ],
  },

  // ── API body size (multipart uploads up to 12 MB) ─────────────────────────
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
