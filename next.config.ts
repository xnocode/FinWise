import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" is for Docker/self-host — Vercel manages its own output
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
