# Traceability

Sentry-based web/electron/mf monitoring + exception-to-fix loop.

## Packages

| Path                | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| `packages/core`     | Thin wrapper over `@sentry/browser` + self-built integrations + server transport |
| `packages/react`    | `MonitorErrorBoundary` + hooks                                                   |
| `packages/electron` | Electron main/renderer/preload                                                   |
| `packages/cli`      | `traceability` CLI client for the server                                         |
| `packages/skills`   | Coding-agent skills (instrumentation / diagnose-issue / add-boundary)            |
| `app`               | Inbox Web UI (React + Vite)                                                      |
| `server`            | Self-hosted Sentry-envelope ingest + PostgreSQL issue store + tRPC API           |

## Prerequisites

- Node.js `>=20` (see `engines.node`)
- [Corepack](https://github.com/nodejs/corepack) — the pnpm version is pinned via the `packageManager` field (`pnpm@10.30.3`), so enable it once and `pnpm` resolves to the right version automatically:

```bash
corepack enable
```

## Quick start

```bash
pnpm install
pnpm -r run build

# 1. start server
cd server && pnpm dev &          # http://localhost:3000

# 2. log in and create a project
cd ../packages/cli && node dist/index.js auth login --server http://localhost:3000
node dist/index.js project create --slug demo --name Demo --json
# copy the project.sentryProjectId for SDK ingest, and project.id for management commands

# 3. start the desktop app (set VITE_SERVER_URL to point at the server)
cd ../../app && echo 'VITE_SERVER_URL=http://localhost:3000' > .env && pnpm dev
```

Management requests require a user access JWT. The CLI obtains and rotates it
through `traceability auth login`, persisting its local session without
displaying token values.

### tRPC debugging panel

The server includes a development-only tRPC UI for browsing and invoking the management
procedures. After `pnpm install` and with the configured PostgreSQL and Redis services
available, start the server in development mode, then open
[`http://localhost:3000/trpc-panel`](http://localhost:3000/trpc-panel):

```bash
NODE_ENV=development MANAGEMENT_AUTH_TOKEN=traceability-development-token pnpm --filter @traceability/server dev
```

In the panel, open **Headers** and add `Authorization: Bearer traceability-development-token`
before invoking a procedure. The panel shell is available only when `NODE_ENV` is not
`production`; every management procedure still enforces `MANAGEMENT_AUTH_TOKEN`. Do not
expose the development server or its fallback token to an untrusted network.

## Integrating the SDK

```ts
import { init, report } from "@traceability/core";

init({
  dsn: "http://localhost:3000",
  appId: "<project.sentryProjectId>",
  token: "dev-token",
  release: "1.0.0",
});

// custom event
report({ type: "feature-action", payload: { foo: 1 }, tags: { feature: "demo" } });
```

## Performance, source maps and Electron

- The Inbox **Performance** tab groups automatic browser metrics (FCP, LCP, CLS, INP, TTFB and DOMContentLoaded) by application. Send application-defined measurements with `reportPerformance({ name, value, unit })`.
- Source-map upload and fix-loop APIs are not part of the current Fastify/tRPC server contract.
- [`examples/electron-demo`](examples/electron-demo) validates main-process crash/uncaught errors, CPU/memory/network samples, OS/hardware context, renderer loss and IPC exception capture alongside the renderer SDK.

## The fix loop

1. SDK reports an exception -> server aggregates it into an issue -> Inbox shows it.
2. Use `traceability issue show <issueId> --json` to inspect an issue.
3. Issue fix-loop commands are reserved and currently return exit code `2`.
