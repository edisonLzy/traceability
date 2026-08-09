# Traceability examples

The examples use the workspace `@tracerability/monitor` package and send telemetry to a running Traceability server.

Before running either example, start the server, build the CLI, log in, and create a project:

```bash
pnpm --dir server db:setup
pnpm --filter @tracerability/cli build
pnpm --filter @tracerability/cli exec traceability auth login --server http://localhost:3000
pnpm --filter @tracerability/cli exec traceability project create \
  --slug demo-web --name "Web Demo" --json
```

The project command returns a complete DSN. Project management uses the saved user access JWT; Monitor ingestion uses the project key encoded in the DSN.

## Web demo

Copy the environment template and set the returned DSN:

```bash
cp examples/web-demo/.env.example examples/web-demo/.env.local
pnpm --filter @tracerability/example-web-demo dev
```

The Vite dev server prints its local URL. The page exercises browser errors and a small user flow through the Monitor SDK.

To verify production source-map resolution:

```bash
pnpm --filter @tracerability/example-web-demo preview:prepare
pnpm --filter @tracerability/example-web-demo preview
```

`preview:prepare` creates a minified build and uploads its source maps with `traceability sourcemap upload --project demo-web --dist ./dist`. Open the preview, trigger the production source-map error, then inspect the issue's resolved stack frame in the desktop app.

## Electron demo

Create a separate project if desired, then pass its DSN to the demo:

```bash
TRACEABILITY_DEMO_DSN='<dsn>' pnpm --filter @tracerability/example-electron-demo dev
```

The example initializes `@tracerability/monitor/electron-main` and starts CPU, memory, and network resource monitoring. Use this project as a starting point for the Electron main/renderer/preload integration.

To exercise the non-interactive main-process uncaught-exception path:

```bash
TRACEABILITY_DEMO_DSN='<dsn>' pnpm --filter @tracerability/example-electron-demo crash:main
```

## Verify ingestion

Open **Monitor → Issues** in the Electron app or use the CLI:

```bash
pnpm --filter @tracerability/cli exec traceability issue list \
  --project-id <project-uuid> --json
pnpm --filter @tracerability/cli exec traceability issue events \
  <issue-id> --limit 20 --json
```
