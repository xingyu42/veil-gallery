import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "veil.ortlinde.com",
        pathname: "/v1/image/**",
      },
    ],
  },
};

export default nextConfig;

