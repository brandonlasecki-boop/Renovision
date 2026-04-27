import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /** Large quotes + JSON snapshot for mockup-only regenerate (FormData). */
    serverActions: {
      bodySizeLimit: "4mb",
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
