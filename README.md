# Traceability

Traceability is a Sentry-compatible observability toolkit that connects browser and Electron telemetry to issue triage, replay, source-map symbolication, and an AI-assisted investigation loop.

## Workspace

| Path               | Purpose                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `packages/monitor` | `@tracerability/monitor`: browser, React, Electron main/renderer/preload monitoring entry points   |
| `packages/cli`     | `traceability` CLI for authentication, projects, issues, metrics, traces, and source maps          |
| `packages/skills`  | Reusable coding-agent skills for setup, flow instrumentation, and issue diagnosis                  |
| `server`           | Fastify API, PostgreSQL/Drizzle persistence, Redis/BullMQ processing, and MinIO source-map storage |
| `app`              | Electron desktop app for Monitor views and AI-assisted investigation                               |
| `examples`         | Browser and Electron integration examples                                                          |

## Requirements

- Node.js `>=22 <23`
- pnpm `11.18.0` through Corepack
- Docker for the recommended local PostgreSQL, Redis, and MinIO stack

```bash
corepack enable
pnpm install
```

## Local development

Start the server infrastructure and apply migrations:

```bash
pnpm --dir server db:setup
```

Run the API, dispatcher, and worker in separate terminals:

```bash
pnpm --dir server dev
pnpm --dir server dev:dispatcher
pnpm --dir server dev:worker
```

Start the Electron app against the local API:

```bash
VITE_SERVER_URL=http://localhost:3000 pnpm dev:app
```

The development bootstrap account is `root@root.com` / `root@root.com`. Replace it before a production deployment.

## Create a project and integrate Monitor

Build the CLI, log in, and create a project:

```bash
pnpm --filter @tracerability/cli build
pnpm --filter @tracerability/cli exec traceability auth login --server http://localhost:3000
pnpm --filter @tracerability/cli exec traceability project create \
  --slug demo-web --name "Web Demo" --json
```

Use the returned `dsn` with the browser SDK:

```ts
import { captureException, init } from "@tracerability/monitor";

init({
  dsn: "http://<project-key>@localhost:3000/<sentry-project-id>",
  environment: "development",
  release: "demo-web@dev",
  tracesSampleRate: 1,
});

try {
  throw new Error("checkout failed");
} catch (error) {
  captureException(error);
}
```

Additional entry points are available at `@tracerability/monitor/react`, `@tracerability/monitor/electron-main`, `@tracerability/monitor/electron-renderer`, and `@tracerability/monitor/electron-preload`.

## Common commands

```bash
pnpm build
pnpm test
pnpm type-check
pnpm lint
pnpm format
pnpm build:app
```

See [`server/README.md`](server/README.md), [`packages/cli/README.md`](packages/cli/README.md), and [`examples/README.md`](examples/README.md) for component-specific workflows.

## Desktop releases

Every push to `master` runs the desktop release workflow. It validates the app, builds native macOS x64/arm64 and Windows x64 packages, uploads GitHub Actions artifacts, and publishes the DMG, ZIP, NSIS installers plus `latest-mac.yml`/`latest.yml` update manifests to a versioned GitHub Release. The packaged app checks desktop releases in the main process. Windows uses `electron-updater`; macOS downloads the matching ZIP and uses a local helper to replace and restart the app, so this personal-use flow does not require Apple Developer signing or notarization. macOS may still require a one-time Gatekeeper approval. The app icon source is `app/resources/icon.png` and is applied to both platforms by `app/electron-builder.yml`.

See [`.github/RELEASING.md`](.github/RELEASING.md) for versioning, signing, notarization, and artifact details.

## Documentation map

- [`CONTEXT.md`](CONTEXT.md): canonical product terminology
- [`AGENTS.md`](AGENTS.md): repository conventions and implementation workflow
- [`CLAUDE.md`](CLAUDE.md): concise architecture guide for coding agents
- [`docs/app-icon.md`](docs/app-icon.md): desktop icon concept and packaging requirements
- [`design-qa.md`](design-qa.md): latest visual regression record
- [`docs/adr`](docs/adr): accepted architecture decisions
- [`docs/superpowers`](docs/superpowers): dated implementation plans and specifications; these are historical records and are not rewritten as living documentation
