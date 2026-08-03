import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // PostgreSQL integration suites intentionally share one database and
    // truncate it in beforeAll. Keep test files serial to avoid concurrent
    // AccessExclusiveLock deadlocks during setup.
    fileParallelism: false,
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  esbuild: {
    target: "es2022",
  },
});
