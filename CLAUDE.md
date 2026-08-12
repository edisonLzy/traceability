# CLAUDE.md

Repository guidance for Claude Code. `AGENTS.md` contains the complete conventions and plan-alignment workflow.

## Commands

This is a pnpm 11 workspace pinned by `packageManager`; use Node 22 as required by `engines`.

```bash
corepack enable
pnpm install
pnpm build
pnpm dev:app
pnpm test
pnpm type-check
pnpm lint
pnpm format
```

Target one package or test with pnpm filters:

```bash
pnpm --filter @tracerability/monitor test
pnpm --filter @tracerability/server test -- src/modules/issues/router.test.ts
pnpm --filter @tracerability/app typecheck
```

Husky runs oxlint and oxfmt through lint-staged. Commits must use Conventional Commits.

## Architecture

```text
@tracerability/monitor ──Sentry envelopes──> Fastify ingest
                                                   │
                              PostgreSQL <── dispatcher/worker ──> Redis + MinIO
                                                   │
                       CLI and Electron app <── tRPC management API
                                                   │
                                  issues, source maps, replay, metrics, traces
```

- `packages/monitor`: browser, React, Electron main, Electron renderer, and Electron preload SDK entry points. Its public imports all use the `@tracerability/monitor` scope.
- `server`: Fastify 5, tRPC 11, PostgreSQL/Drizzle, Redis/BullMQ, and MinIO. Domain code lives in `src/modules`; infrastructure adapters live in `src/infrastructure`. Sentry envelopes use `POST /api/{sentryProjectId}/envelope/`; management uses `/api/trpc` with user JWT authentication.
- `app`: Electron 39 with electron-vite, React 19, Tailwind 4, TanStack Query, CodeMirror, and TipTap. `src/main` owns authentication persistence, JSONL Agent sessions, models, prompts, skills, tools, extensions, and backend tRPC access. `src/preload` exposes the typed bridge. `src/renderer` owns the UI for Login, Inbox, Monitor/Issues, Monitor/Sourcemaps, Explorer, and Agent conversations.
- `packages/cli`: Commander-based `traceability` CLI. It manages auth, projects, issues/events, source maps, metrics, and traces, storing rotating user tokens in `~/.traceability/config.json`.
- `packages/skills`: agent-facing setup, trace, and diagnose-issue skills. `.agents/skills` mirrors the installed repository-local copies.
- `examples`: browser and Electron Monitor integrations.

Internal packages use `workspace:*`. Shared dependency versions use the `catalog:` block in `pnpm-workspace.yaml`.

## App process boundaries

The Electron app has three builds:

- `src/main`: Node/Electron main process; relative imports use `.js` suffixes.
- `src/preload`: isolated bridge; relative imports use `.js` suffixes.
- `src/renderer`: browser bundle; use `@renderer`, `@shared`, and `@extensions` aliases without `.js` suffixes.

Renderer code reaches main only through `window.electronAPI`. Shared IPC contracts live in focused `src/shared/*-ipc.ts` modules. Durable Agent sessions are JSONL files below Electron `userData/sessions`; the main process also migrates the historical SQLite session store when present.

The desktop backend comes from `VITE_SERVER_URL`. Login/refresh use the server auth router, and authenticated requests carry the access JWT persisted in `auth-session.bin`.

## Conventions

- Use pnpm only; use `pnpm exec`, never `npx`.
- Use `import type` for type-only imports.
- Server and package TypeScript is ESM; relative source imports use emitted `.js` specifiers.
- TypeScript is strict with `noUncheckedIndexedAccess`.
- App aliases must stay synchronized across `tsconfig.json`, `electron.vite.config.ts`, and `vitest.config.ts`.
- Native/install build allowlists live in `pnpm-workspace.yaml`.

## Desktop packaging

`app/electron-builder.yml` produces macOS DMG/ZIP and Windows NSIS packages. The shared icon source is `app/resources/icon.png`. Pushes to `master` run `.github/workflows/release.yml`; see `.github/RELEASING.md`.

## Working with superpowers plans

Plans in `docs/superpowers/plans` decompose work into sequenced TODOs; specs in `docs/superpowers/specs` carry authoritative hand-off contracts. Verify the current code before trusting a dated plan, align each TODO on goal/scope/files, record decisions in the plan and a self-contained spec, then implement against that spec. The complete workflow is in `AGENTS.md` under “Aligning and Implementing Plan TODOs.”
