import type { NextConfig } from "next";
import { validateDataMode } from "./lib/config/data-mode.mjs";
validateDataMode(process.env);
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source:
          "/:path(dashboard|patients|prescription|settings|login|booking)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};
export default nextConfig;
