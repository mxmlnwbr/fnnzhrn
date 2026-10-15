import type { NextConfig } from "next";
import { syncConfigured } from "./src/lib/env";

const nextConfig: NextConfig = {
  // Tells the browser whether to offer sign-in; only this flag is exposed, never the settings themselves.
  env: { NEXT_PUBLIC_SYNC_ENABLED: syncConfigured() ? "1" : "" },
};

export default nextConfig;
