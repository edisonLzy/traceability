import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";

import { traceabilityDebugIdSourcemapPlugin } from "./vite-plugins/debug-id-sourcemap";

/**
 * Web demo build config.
 *
 * - `build.sourcemap: true` — emit .js.map files alongside the bundle.
 * - `@sentry/vite-plugin` in **inject-only** mode: it stamps a debug_id UUID
 *   into every chunk (via the `_sentryDebugIds` snippet) so the SDK will
 *   attach them to `event.debug_meta.images[]`. It does **not** upload to
 *   Sentry.io.
 * - `traceabilityDebugIdSourcemapPlugin`: reads each chunk's debug_id back
 *   out and writes it into the paired `.map` file's top-level `debug_id`
 *   field so `traceability sourcemap upload` can pick it up.
 *
 * `authToken` / `org` / `project` are unused but the Sentry plugin still
 * validates their presence in some paths, so they carry placeholder values.
 */
export default defineConfig({
  server: { port: 5174 },
  build: { sourcemap: true },
  plugins: [
    sentryVitePlugin({
      telemetry: false,
      // "disable-upload" keeps the debug-id injection but skips network calls
      // to Sentry.io.
      sourcemaps: { disable: "disable-upload" },
      release: { create: false, inject: false },
      authToken: "unused-inject-only",
      org: "unused",
      project: "unused",
      disable: false,
      silent: true,
    }),
    traceabilityDebugIdSourcemapPlugin(),
  ],
});
