# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` covers conventions in more detail. The server is Fastify + PostgreSQL; the management API is tRPC and Sentry envelopes remain raw HTTP.

## Commands

pnpm 10 workspace (`packageManager` pinned → `corepack enable` once). Node 22 LTS (pinned via `.node-version` + `engines`; better-sqlite3 11.10.0 ships prebuilt binaries for Node 22's ABI 127, so installs skip source compilation).

```bash
pnpm install
pnpm build              # build packages/* + server (tsc), then app (electron-vite)
pnpm dev:app            # Electron app dev (electron-vite, inspector on :5858)
# server dev:   cd server && pnpm dev          # tsx watch, http://localhost:3000
# cli dev:      cd packages/cli && pnpm dev    # tsx; or build then node dist/index.js

pnpm test               # vitest run across all packages (pnpm -r run test)
pnpm type-check         # tsc --noEmit per package
pnpm lint               # oxlint --fix   (no eslint/prettier in this repo)
pnpm format             # oxfmt --write
```

Per-package / single test:

```bash
pnpm --filter @traceability/server test -- src/__tests__/issues.test.ts
pnpm --filter @traceability/core exec vitest run -t "transport"
pnpm --filter @traceability/app typecheck
```

Lint/format run **only on commit** via husky + lint-staged (VS Code format-on-save is intentionally off). Commits must be Conventional Commits (`feat`, `fix`, `chore`, `docs`, …); commitlint enforces this with header/body length limits disabled.

## Architecture

Traceability connects frontend error capture to an AI-assisted fix loop. End-to-end flow:

```
SDK (@traceability/core) --Sentry envelope--> server /api/{sentryProjectId}/envelope/
                                                | aggregates events into issues
                                                v
                                  tRPC management API  <--->  Inbox (Electron app)
```

**Monorepo** (pnpm workspace + catalog): `packages/*` (SDK + types + CLI + skills), `server`, `app`, `examples/*`. Shared versions live in the `catalog:` block of `pnpm-workspace.yaml` (typescript ^7, vitest ^4, tsx ^4) and are referenced as `"vitest": "catalog:"`. Internal deps use `"workspace:*"`; package names are `@traceability/<name>`.

**`@traceability/core`** wraps `@sentry/browser` with a custom bearer-token POST transport (`transport/serverTransport.ts`) targeting the compatibility route `/api/ingest/envelope/:projectId` (the server's canonical Sentry route is `/api/:projectId/envelope/`). `beforeSend` stamps the SDK project identifier and attaches an rrweb replay id; the public surface is `init` / `captureException` / `report` / `reportPerformance` / `setApp`. Integrations: CORS diagnostic, white-screen detection, rrweb replay, browser performance metrics (FCP/LCP/CLS/INP/TTFB).

**`server/`** — Fastify + PostgreSQL + Drizzle + Redis/BullMQ. The raw Sentry-compatible ingest route lives under `domains/ingest`; protected management procedures live under `src/trpc/` at `/api/trpc`. Projects and issues are the management model. Management auth is user JWT (`JWT_SECRET`, `JWT_ACCESS_TOKEN_TTL_SECONDS`) issued by `auth.login` / `auth.refresh`; config is supplied through runtime environment variables, including `DATABASE_URL` and `REDIS_URL`.

**`app/`** — Electron 39 + electron-vite + React 19 + Tailwind 4 + react-query + react-router. Three builds: `src/main` (Node), `src/preload` (the only main↔renderer bridge), `src/renderer` (browser; aliases `@renderer`, `@shared`). The **main process owns state**: `main/agent/` (`AgentPool`/`AgentRuntime`/`ModelRegistry`/`SessionStore`/`monitor`, built on `@earendil-works/pi-agent-core` + `pi-ai`) and `main/db/database.ts` (SQLite at `userData/traceability-agent.sqlite`). IPC handlers in `main/index.ts` are **zod-validated** and exposed through `preload/index.ts`; the typed contract lives in `shared/ipc.ts`. Renderer routes: `issues`, `issues/:id`, `performance`; the chat agent UI is under `renderer/features/agent-panel`. Management requests carry the user access JWT from `auth-session.bin` (see `main/trpc/client.ts`); the app reads its backend from `VITE_SERVER_URL`.

> An in-progress migration (`docs/superpowers/plans/2026-07-13-agent-core-migration.md`) targets a flatter `main/` layout (`main/agent-*`, `main/sessions/`, split `shared/*-ipc.ts`). The current code is mid-migration; follow the current layout when editing and consult that plan before large refactors.

**`packages/cli`** — `traceability` binary (commander). Commands: `auth login|status|logout`, `config set`, `project list|show|create|update|remove`, and `issue list|show`. The removed `app` alias is not supported; fix-loop commands return exit code 2 until the server supports them.

**`packages/skills`** — agent-facing `SKILL.md` modules (`instrumentation`, `diagnose-issue`, `add-boundary`) that teach coding agents how to call the core SDK and run the fix loop. Not built; consumed as docs.

## Conventions that affect code

- **Strictly pnpm** — use `pnpm exec`, never `npx`/`npm`/`yarn`.
- **ESM `.js` import specifiers**: `packages/*` and `server` are `type: module` built with `tsc`. Relative imports use a `.js` suffix (e.g. `import { getConfig } from "./config.js"`) even though the source is `.ts` — `tsc` does not rewrite specifiers, so this matches the emitted JS. The Vite/electron-vite build in `app/` does not require this, but match the surrounding file's style.
- **`import type`** for type-only imports.
- TypeScript strict + `noUncheckedIndexedAccess` (`tsconfig.base.json`); the app splits into `tsconfig.web.json` / `tsconfig.node.json`.
- `onlyBuiltDependencies` in root `package.json` gates native builds (`better-sqlite3`, `electron`, `esbuild`).

## Working with superpowers plans

Plans (`docs/superpowers/plans/`) decompose work into sequenced TODOs; specs (`docs/superpowers/specs/`) carry the hand-off contracts. **Align each TODO before implementing it**, on three dimensions: what it does, its change scope (in/out), and its concrete changes + resulting file structure. Workflow: first verify the current code against the plan text with `grep`/`ls`/`Read` (catch baseline drift - the plan is often written against an older state), read any referenced plan task for exact contracts, align via `AskUserQuestion` one TODO at a time, then **write the decisions to files** - update the plan/handoff to correct anything that misdirected the alignment, and emit a self-contained spec to `docs/superpowers/specs/`. The spec is the single source for implementation; nothing is re-derived from the session. Full procedure: `AGENTS.md` §"Aligning and Implementing Plan TODOs".
