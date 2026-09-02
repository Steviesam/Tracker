import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["exceljs", "bcryptjs"],
  // This app sits next to another project with its own lockfile; pin the root so Next
  // does not infer the parent directory.
  outputFileTracingRoot: path.join(__dirname),
  // Development only. Every corner covers something: the default sits on the sidebar's
  // account row, and the bottom right is now the phone's tab bar. Top left costs a page
  // title, which is the only one of the three you do not have to click.
  devIndicators: { position: "top-left" },
};

export default nextConfig;
