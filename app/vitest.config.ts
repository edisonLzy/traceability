import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@extensions": resolve(import.meta.dirname, "src/extensions"),
      "@renderer": resolve(import.meta.dirname, "src/renderer"),
      "@shared": resolve(import.meta.dirname, "src/shared"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
