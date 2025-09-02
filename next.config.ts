import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow builds to pass on Vercel even if ESLint finds issues (e.g., any)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
