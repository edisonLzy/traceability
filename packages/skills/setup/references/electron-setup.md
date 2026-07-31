# Electron project setup reference

Target: Electron projects (electron-vite or equivalent). Golden reference: `examples/electron-demo`.

The Electron SDK has three surfaces: **main** (`initMain`), **preload** (`preloadBridge`), and **renderer** (`init` from `@traceability/core`). The token stays in the main process; the renderer fetches its config over IPC.

## Dependencies

Add to the target package's `package.json` (monorepo-internal, `workspace:*`):

- `@traceability/core` - required.
- `@traceability/electron` - required.

Then run `pnpm install` at the repo root.

## Environment variables

Create `.env` (loaded in the **main** process). The skill fills the first two; **the user fills the token**:

```env
TRACEABILITY_DSN=http://localhost:3000
TRACEABILITY_APP_ID=<project.sentryProjectId from project create>
TRACEABILITY_API_TOKEN=<user fills: API token from the server admin>
```

> `.env` must be in `.gitignore`. Load it in the main entry (e.g. `import "dotenv/config"`, or electron-vite's env loading) before `initMain`.

## Main process

Create `src/main/monitor.ts` (dedicated module):

```ts
import "dotenv/config";
import { initMain, type MainMonitor } from "@traceability/electron";

export function initMonitor(): MainMonitor {
  return initMain({
    dsn: process.env.TRACEABILITY_DSN!,
    appId: process.env.TRACEABILITY_APP_ID!,
    token: process.env.TRACEABILITY_API_TOKEN!,
    release: "your-app@1.0.0", // derive from package.json if available
    environment: process.env.NODE_ENV ?? "development",
    app: { name: "your-app", version: "1.0.0" },
    system: { sampleInterval: 30_000, memoryThreshold: 0.85, cpuThreshold: 0.9 },
  });
}
```

`initMain` automatically registers the `traceability:config` IPC handler, returning `{ dsn, appId, token, release, environment }` - this is how the renderer gets its config at runtime. It also registers `traceability:environment`, `traceability:sample-resources`, and the `traceability:report` / `traceability:breadcrumb` channels.

## Preload

Use the package's preload bridge. In an ESM preload:

```ts
export { preloadBridge } from "@traceability/electron";
```

If the preload is bundled as CommonJS (sandboxed renderer, as in `electron-demo`), point `webPreferences.preload` at the CJS build - resolve the path for your project layout (the demo uses `../../../packages/electron/dist/preload.cjs`):

```ts
import { fileURLToPath } from "node:url";
// inside createWindow's webPreferences:
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  preload: fileURLToPath(
    new URL("<path-to>@traceability/electron/dist/preload.cjs", import.meta.url),
  ),
}
```

`preloadBridge` exposes `window.traceability` (when `contextIsolation` is on) with `getConfig`, `report`, `invoke`, `addBreadcrumb`, `getEnvironment`, `sampleResources`.

## Renderer

Fetch config from the main process, then init (reusing `@traceability/core`):

```ts
import { init } from "@traceability/core";

declare global {
  interface Window {
    traceability?: {
      getConfig(): Promise<{
        dsn: string;
        appId: string;
        token: string;
        release?: string;
        environment?: string;
      }>;
    };
  }
}

async function start() {
  const cfg = await window.traceability!.getConfig();
  init({
    dsn: cfg.dsn,
    appId: cfg.appId,
    token: cfg.token,
    release: cfg.release,
    environment: cfg.environment,
    replay: { enabled: true, maxDurationMs: 60_000 },
  });
}

void start().catch((err) => {
  console.error("Could not initialize monitoring:", err);
});
```

The token is **not** hardcoded into renderer source - it arrives via IPC from the main process.

## Entry wiring

Call `initMonitor()` once on startup, before creating windows:

```ts
import { app } from "electron";
import { initMonitor } from "./main/monitor";

app.whenReady().then(() => {
  initMonitor();
  // createWindow() ...
});
```

## Verify the setup

Run the app and trigger a renderer error:

```ts
import { captureException } from "@traceability/core";
captureException(new Error("traceability setup check"));
```

Confirm it appears in the Inbox UI, or via the CLI:

```bash
traceability issue list --project-id <projectId>
```
