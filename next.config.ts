import type { NextConfig } from "next";
import { syncConfigured } from "./src/lib/env";

const nextConfig: NextConfig = {
  // Tells the browser whether to offer sign-in; only this flag is exposed, never the settings themselves.
  env: { NEXT_PUBLIC_SYNC_ENABLED: syncConfigured() ? "1" : "" },
  // The Cockpit route reads its HTML file at runtime.
  outputFileTracingIncludes: { "/cockpit": ["./src/app/cockpit/cockpit.html"] },
  async redirects() {
    return [
      // The tracker used to live on its own subdomain.
      { source: "/:path*", has: [{ type: "host", value: "depot.fnnzhrn.ch" }], destination: "https://fnnzhrn.ch/depot", permanent: true },
    ];
  },
};

export default nextConfig;
