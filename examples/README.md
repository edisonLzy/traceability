# Traceability examples

Runnable demos that integrate `@tracerability/core` against a local server.

## web-demo

A vanilla Vite + TypeScript app that fires each reportable event type.

### Prerequisites

1. Start the server (from repo root):
   ```bash
   export TRACEABILITY_API_TOKEN=dev-token
   cd server && pnpm dev
   ```
2. Start the Inbox UI and create an application, copy its `appId`:
   ```bash
   cd app && pnpm dev
   ```
   Open http://localhost:5173, log in (server=http://localhost:3000, token=dev-token), create an app, copy the App ID.

### Run the demo

```bash
cd examples/web-demo
pnpm install
pnpm dev
```

Open http://localhost:5174. In the browser console set the appId/token if needed:

```js
localStorage.setItem("demo.appId", "<paste appId>");
localStorage.setItem("demo.token", "dev-token");
location.reload();
```

Click the buttons. Each fires an event that the server ingests and aggregates into an issue visible in the Inbox.

### Verify source-map resolution with a production-like preview

The preview build is minified and emits source maps. Upload those maps before you run the preview server so the Inbox can turn the minified stack frame back into the TypeScript location.

```bash
cd examples/web-demo
export TRACEABILITY_DEMO_APP_ID='<paste appId>'
export TRACEABILITY_DEMO_TOKEN='dev-token'
pnpm preview:prepare
pnpm preview
```

Open http://localhost:4174, click **Throw production source-map error**, then open the resulting issue. Its Stack trace tab shows `src/previewFailure.ts` and the highlighted original line. Source maps are keyed by app, release and emitted asset path; the demo upload script is also suitable as a small CI deployment step.

## electron-demo

An Electron main/renderer demo covering the Electron-specific monitor contract: main-process uncaught errors and crash reporting, CPU/memory/network samples, OS/hardware/client versions, `render-process-gone`, and monitored IPC exceptions. Renderer exceptions and rejections reuse the Web SDK.

```bash
cd examples/electron-demo
export TRACEABILITY_DEMO_APP_ID='<paste appId>'
export TRACEABILITY_DEMO_TOKEN='dev-token'
pnpm dev
```

Use the eight controls in the window and inspect the same application in the Inbox. `pnpm crash:main` invokes the startup uncaught-exception path for a non-interactive crash-flow check; the regular demo button leaves the window open while producing the same monitor event.

### Verify the loop

1. Click "Throw TypeError" -> the Inbox Issues page shows a new `TypeError: demo...` issue (live via WebSocket).
2. Open the issue -> "Start AI fix" -> the Fix Session page shows `traceability issue show <id> --json`.
3. From a terminal:
   ```bash
   cd packages/cli
   node dist/index.js config set --server http://localhost:3000 --token dev-token
   node dist/index.js issue show <issueId> --json
   ```
