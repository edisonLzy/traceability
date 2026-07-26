import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built index.html loads its assets via file:// when
  // Electron loadFile() opens it (an absolute '/assets/...' href resolves to
  // the filesystem root under file:// and the bundle never loads).
  base: "./",
  root: "./renderer",
  resolve: {
    alias: {
      "@traceability/monitor": resolve(
        import.meta.dirname,
        "../../packages/monitor/src/browser/index.ts",
      ),
    },
  },
  build: {
    outDir: "../dist/renderer",
    emptyOutDir: false,
  },
});
