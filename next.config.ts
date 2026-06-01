import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.12.112"],
  serverExternalPackages: ["node-ical"],
};

export default nextConfig;
