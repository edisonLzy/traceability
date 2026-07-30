import type { Plugin } from "vite";

/**
 * Companion to `@sentry/vite-plugin`.
 *
 * The Sentry plugin, in `sourcemaps.disable: "disable-upload"` mode, stamps a
 * unique `debug_id` into each emitted JS chunk (via the `_sentryDebugIds`
 * snippet) but **does not** copy that debug_id into the paired `.map` file —
 * writing to the map is only performed as part of Sentry.io's upload path.
 *
 * Our workflow uploads maps to our own server via `traceability sourcemap
 * upload`, which reads the map's top-level `debug_id` field. So we need to
 * mirror the debug_id from each chunk into its map ourselves.
 *
 * This plugin runs in `generateBundle` (post-Sentry) and, for every chunk that
 * contains the `_sentryDebugIds[...] = "<uuid>"` marker, patches the paired
 * source map asset to include `{ ..., "debug_id": "<uuid>" }`.
 *
 * The regex is intentionally forgiving: Sentry's snippet minifies slightly
 * differently across chunker settings, but the "uuid string literal appears
 * inside a `_sentryDebugIds[...] =` assignment" invariant holds.
 */
const SENTRY_DEBUG_ID_RE = /_sentryDebugIds\s*\[[^\]]+\]\s*=\s*["']([0-9a-fA-F-]{8,64})["']/;

export function traceabilityDebugIdSourcemapPlugin(): Plugin {
  return {
    name: "traceability:debug-id-sourcemap",
    // Run after @sentry/vite-plugin, which uses `enforce: "post"` for its
    // injection plugin. Landing in the default position means Sentry's chunk
    // rewrite has already committed by the time we look at code.
    apply: "build",
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") continue;

        const match = SENTRY_DEBUG_ID_RE.exec(output.code);
        if (!match) continue;
        const debugId = match[1];
        if (!debugId) continue;

        const mapName = `${fileName}.map`;
        const mapAsset = bundle[mapName];
        if (!mapAsset || mapAsset.type !== "asset") continue;

        const source = mapAsset.source;
        const raw = typeof source === "string" ? source : Buffer.from(source).toString("utf8");
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          continue;
        }
        parsed.debug_id = debugId;
        mapAsset.source = JSON.stringify(parsed);
      }
    },
  };
}
