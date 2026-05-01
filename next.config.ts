import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Try flow POSTs the bathroom photo via Server Action (up to 20MB after client checks).
     * Default 1MB / a too-low limit causes failed requests (often “page couldn’t load” on mobile) before the action runs.
     */
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
