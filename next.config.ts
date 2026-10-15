import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Small, self-contained image for Cloud Run. */
  output: "standalone",
  /**
   * firebase-admin reaches Firestore over gRPC and resolves credentials at
   * runtime, so it must stay outside the server bundle. Only matters when
   * TRANSPORT=firestore; the demo path never loads it.
   */
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore", "@grpc/grpc-js"],
};

export default nextConfig;
