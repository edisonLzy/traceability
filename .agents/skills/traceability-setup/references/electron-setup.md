# Electron project setup reference

Target: Electron projects (electron-vite or equivalent). Golden reference: `examples/electron-demo`.

The SDK has three surfaces: **main** (`@traceability/monitor/electron-main`), **renderer** (`@traceability/monitor/electron-renderer`), and **browser** (`@traceability/monitor`, if a part of the app runs in a plain browser context). All are Sentry wrappers — there is no custom IPC bridge; Sentry's own Electron integration keeps the main and renderer processes in sync.

## Dependencies

Add to the target package's `package.json` (monorepo-internal, `workspace:*`):

```jsonc
"@traceability/monitor": "workspace:*"
```

Then run `pnpm install` at the repo root.

## Environment variables

Create `.env` (loaded in the **main** process). The skill fills the DSN; it is the **only** credential:

```env
TRACEABILITY_DSN=http://<publicKey>@<server>/<sentryProjectId>
```

> `.env` must be in `.gitignore` — the DSN's public key must not be committed. Load it in the main entry before `init` (electron-vite loads `.env` automatically; otherwise `import "dotenv/config"`).

## Main process

Create `src/main/monitor.ts` (dedicated module), modeled on `examples/electron-demo/src/main.ts`:

```ts
import { init, startResourceMonitor } from "@traceability/monitor/electron-main";

export function initMonitor(): void {
  init({ dsn: process.env.TRACEABILITY_DSN! });
  startResourceMonitor({ sampleInterval: 30_000, memoryThreshold: 0.85, cpuThreshold: 0.9 });
}
```

`init` accepts the full `ElectronMainOptions` from `@sentry/electron/main`. Additional exports from `electron-main` subpath: `captureException`, `captureMessage`, `setUser`, `setTag`, `setContext`, `addBreadcrumb`, `withScope`, `flush`, `sampleResources`, `getEnvironment`. `startResourceMonitor` polls CPU/memory and calls `onThreshold` when a threshold is crossed.

## Renderer

Create `src/renderer/monitor.ts` (or call directly at the renderer entry):

```ts
import { init } from "@traceability/monitor/electron-renderer";

init({});
```

The renderer is kept minimal: Sentry's Electron integration pulls its config from the main process, so no DSN is repeated here. Additional exports mirror the main surface: `captureException`, `captureMessage`, `setUser`, `setTag`, `setContext`, `addBreadcrumb`, `withScope`.

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

Call the renderer `init({})` at the renderer entry (before any UI code that might throw).

## Verify the setup

Run the app and trigger a renderer error:

```ts
import { captureException } from "@traceability/monitor/electron-renderer";
captureException(new Error("traceability setup check"));
```

Confirm it appears in the Inbox UI, or via the CLI:

```bash
traceability issue list --project-id <projectId>
```
