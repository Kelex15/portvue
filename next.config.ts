import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: { position: "bottom-right" },
  // Native SQLite bindings for local file databases; keep them out of the server bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
