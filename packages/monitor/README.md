# `@tracerability/monitor`

Traceability's capture SDK exposes Sentry-compatible monitoring for browsers, React, and Electron while adding Traceability integrations such as replay, CORS diagnostics, white-screen detection, resource monitoring, and monitored IPC.

## Entry points

| Import | Runtime |
| --- | --- |
| `@tracerability/monitor` | Browser SDK and tracing/metrics helpers |
| `@tracerability/monitor/react` | React integration |
| `@tracerability/monitor/electron-main` | Electron main-process monitoring and resource sampling |
| `@tracerability/monitor/electron-renderer` | Electron renderer monitoring |
| `@tracerability/monitor/electron-preload` | Electron preload helpers |

## Browser setup

```ts
import { captureException, init } from "@tracerability/monitor";

init({
  dsn: "http://<project-key>@localhost:3000/<sentry-project-id>",
  environment: "development",
  release: "checkout-web@dev",
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
});

captureException(new Error("checkout failed"));
```

The DSN comes from `traceability project create --json` or `traceability project show <project-id> --json`.

## Electron main setup

```ts
import { init, startResourceMonitor } from "@tracerability/monitor/electron-main";

init({ dsn: process.env.TRACEABILITY_DSN });
startResourceMonitor();
```

Use the renderer and preload entry points as a matched pair when capturing renderer errors or instrumenting IPC. See [`examples/electron-demo`](../../examples/electron-demo) and the setup skill at [`packages/skills/setup/references/electron-setup.md`](../skills/setup/references/electron-setup.md).

## Development

```bash
pnpm --filter @tracerability/monitor build
pnpm --filter @tracerability/monitor typecheck
pnpm --filter @tracerability/monitor test
```
