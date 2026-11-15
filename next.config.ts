import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [{ source: "/deck", destination: "/deck.html" }];
  },
};

export default nextConfig;
