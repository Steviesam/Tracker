import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["exceljs", "bcryptjs"],
  // This app sits next to another project with its own lockfile; pin the root so Next
  // does not infer the parent directory.
  outputFileTracingRoot: path.join(__dirname),
  // Development only, but the badge's default corner sits on top of the sidebar's account
  // row, which makes it impossible to click while working on the app.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
