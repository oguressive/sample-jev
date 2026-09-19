import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@sample-jev/ui", "@sample-jev/jev-server"],
  agentRules: false,
};

export default config;
