import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig((_environment) => {
  return {
    main: {
      build: {
        externalizeDeps: true,
      },
    },
    preload: {
      build: {
        // Bundle @traceability/monitor/electron-preload (and the Sentry IPC it
        // pulls in) into the preload: the monitor package is ESM, so leaving it
        // external would emit a require() of ESM in this CJS preload. Electron
        // itself stays external.
        externalizeDeps: { exclude: ["@traceability/monitor"] },
        // Keep preload compatible with Electron's renderer sandbox. The app
        // package is ESM, so Electron Vite emits this CJS preload as index.cjs.
        rollupOptions: {
          output: {
            format: "cjs",
          },
        },
      },
    },
    renderer: {
      root: resolve(import.meta.dirname, "src/renderer"),
      base: "./",
      assetsInclude: ["**/*.lottie"],
      plugins: [react(), tailwindcss()],
      build: {
        rollupOptions: {
          input: resolve(import.meta.dirname, "src/renderer/index.html"),
        },
      },
      resolve: {
        alias: {
          "@renderer": resolve(import.meta.dirname, "src/renderer"),
          "@shared": resolve(import.meta.dirname, "src/shared"),
          "@extensions": resolve(import.meta.dirname, "src/extensions"),
        },
      },
    },
  };
});
