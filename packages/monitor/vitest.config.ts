import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
  resolve: {
    extensions: [".ts", ".js"],
    extensionAlias: { ".js": [".ts", ".js"] },
  },
  esbuild: { target: "es2022" },
});
