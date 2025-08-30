import type { NextConfig } from "next";

// Configure Turbopack root explicitly to avoid workspace root inference warnings
const nextConfig = {
  turbopack: {
    // root directory of this Next.js app
    root: __dirname,
  },
} as unknown as NextConfig

export default nextConfig;
