import type { NextConfig } from "next";

const demoMode = process.env.TG_DEMO_MODE ? process.env.TG_DEMO_MODE === "true" : process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Exposes the demo-mode flag to the browser bundle (for the "demo mode" badge).
  env: { NEXT_PUBLIC_TG_DEMO_MODE: demoMode ? "true" : "false" }
};

export default nextConfig;
