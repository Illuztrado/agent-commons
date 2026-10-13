import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Small, self-contained image for Cloud Run. */
  output: "standalone",
};

export default nextConfig;
