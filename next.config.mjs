/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "sharp",
    "ioredis",
    "bullmq",
  ],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
