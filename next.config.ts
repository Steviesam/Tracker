import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["exceljs", "bcryptjs"],
  // This app sits next to another project with its own lockfile; pin the root so Next
  // does not infer the parent directory.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
