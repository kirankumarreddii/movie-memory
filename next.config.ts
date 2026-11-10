import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google profile photos.
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
