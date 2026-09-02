import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Database-backed tests truncate the tables they use, so they must never point at the
    // database being developed against. `setupFiles` runs before any test imports Prisma,
    // which is the only moment the connection string can still be changed.
    setupFiles: ["tests/helpers/setup.ts"],
  },
});
