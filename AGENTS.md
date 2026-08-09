# AGENTS.md

This file provides guidance to AI agents (Claude Code, Copilot, etc.) when working with code in this repository.

## Project Overview

**Traceability** is a Sentry-based web monitoring + exception-to-fix loop toolkit. It connects frontend error capture with session replay and AI-assisted debugging to create a seamless workflow from exception detection to resolution.

### Key Capabilities

- **rrweb session recording**: Capture and replay user sessions alongside errors
- **Sentry error integration**: Bridge between Sentry error events and replay data
- **Exception-to-fix loop**: AI-powered analysis connecting stack traces to source code
- **Desktop application**: Electron app for issue triage, source maps, replay, and AI-assisted investigation
- **Server backend**: Fastify API with PostgreSQL/Drizzle, Redis/BullMQ, and MinIO

## Monorepo Structure

```
traceability/
├── app/                          # Electron desktop application and packaging config
│   ├── src/
│   │   ├── main/                 # Electron main process
│   │   ├── renderer/             # React renderer (UI)
│   │   └── preload/              # Preload scripts
│   ├── package.json              # @tracerability/app
│   └── electron-vite.config.ts
├── server/                       # Fastify API + background processing
│   ├── src/                      # tRPC, ingest, PostgreSQL, BullMQ, object storage
│   └── package.json              # @tracerability/server
├── packages/
│   ├── monitor/                  # @tracerability/monitor: browser/React/Electron capture SDK
│   ├── cli/                      # @tracerability/cli: command-line interface
│   └── skills/                   # @tracerability/skills: reusable skill modules
├── examples/                     # Example usage projects
├── docs/                         # Documentation
├── .husky/                       # Git hooks (pre-commit, commit-msg)
├── .vscode/                      # Workspace settings and debug configs
├── AGENTS.md                     # This file
├── pnpm-workspace.yaml           # Workspace + catalog versioning
├── oxlint.config.ts              # Linter configuration
├── oxfmt.config.ts               # Formatter configuration
├── lint-staged.config.mjs        # Pre-commit lint/stage configuration
├── commitlint.config.mjs         # Commit message linting
└── tsconfig.base.json            # Shared TypeScript configuration
```

## Common Commands

```bash
pnpm dev:app          # Start Electron app in dev mode (with inspector on 5858)
pnpm build            # Build all packages, server, and app
pnpm build:app        # Build only the Electron app via electron-vite
pnpm test             # Run all tests across all packages
pnpm type-check       # Type-check all packages (runs tsc --noEmit per package)
pnpm lint             # Lint all files (oxlint --fix)
pnpm format           # Format all files (oxfmt --write)
```

Each package also supports individual commands via `pnpm --filter`:

```bash
pnpm --filter @tracerability/monitor test
pnpm --filter @tracerability/server typecheck
pnpm --filter @tracerability/app dev
```

## Architecture

| Layer              | Tech                                                             |
| ------------------ | ---------------------------------------------------------------- |
| **Electron App**   | Electron 39, React 19, Vite 7 (electron-vite), Tailwind CSS 4    |
| **Server**         | Fastify + tRPC, PostgreSQL/Drizzle, Redis/BullMQ, MinIO, Pino    |
| **Monitor SDK**    | Sentry browser/React/Electron integrations + replay and metrics  |
| **Desktop UI**     | React 19, TanStack Query, Base UI, CodeMirror, TipTap             |
| **Package Mgr**    | pnpm 11 workspace with a shared dependency catalog               |

### Key Dependencies

- **Runtime**: Node.js >=22 <23, pnpm 11.18.0
- **Language**: TypeScript 7.x (catalog-managed)
- **Testing**: Vitest 4.x (catalog-managed) across all packages
- **Linting**: oxlint (not ESLint) with typescript + import plugins
- **Formatting**: oxfmt (not Prettier) with import sorting enabled
- **Editor**: oxlint config at `oxlint.config.ts`, oxfmt config at `oxfmt.config.ts`

## Key Conventions

### Package Manager

- **Strictly `pnpm`**. Never use `npm` or `yarn`.
- Use `pnpm exec <command>` instead of `npx <command>`.

### Shared Versions

- Shared dependency versions are managed via **pnpm catalog** in `pnpm-workspace.yaml`.
- Catalog entries currently include TypeScript, Vitest, tsx, CodeMirror, and TipTap core.

### Code Quality

- **Linting**: `oxlint` with typescript + import plugins. Config at `oxlint.config.ts`.
- **Formatting**: `oxfmt` with import sorting. Config at `oxfmt.config.ts`.
- Both run **only on commit** via `lint-staged` (see below), not on save.

### Git Hooks (Husky + lint-staged)

- **`pre-commit`**: Runs `lint-staged`, which executes:
  - `oxlint --fix` on staged `*.{js,jsx,ts,tsx}` files
  - `oxfmt --write` on staged `*.{js,jsx,ts,tsx,json}` files
- **`commit-msg`**: Runs `commitlint` to enforce **Conventional Commits**.

### Conventional Commits

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

<optional body>

Co-Authored-By: ...
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`, `build`, `revert`.

### Testing

- **Vitest 4.x** (catalog-managed) is the test framework across all packages.
- Each package has its own `vitest.config.ts` and test directory (typically `src/tests/` or at package root).
- Root `pnpm test` runs all package tests via `pnpm -r run test`.

### TypeScript

- All packages use TypeScript 7.x from the workspace catalog.
- Shared base config at `tsconfig.base.json`.
- Each package extends the base config with its own `tsconfig.json`.
- Type-check with `pnpm type-check` (runs `tsc --noEmit` per package).

### Import Type Convention

- Always use `import type { ... }` for pure type imports:

  ```typescript
  // Good
  import type { SomeType } from "./module";
  import { runtimeValue, type SomeType } from "./module";

  // Avoid
  import { SomeType } from "./module"; // when SomeType is only a type
  ```

### Workspace References

- Internal packages are referenced via `workspace:*` protocol in `package.json`.
- Package names follow the `@tracerability/<name>` convention.
- `pnpm-workspace.yaml` allowlists native/install builds such as `better-sqlite3`, `electron`, `esbuild`, `msgpackr-extract`, `protobufjs`, and `@sentry/cli`.

## Aligning and Implementing Plan TODOs

Plans live in `docs/superpowers/plans/`; specs in `docs/superpowers/specs/`. A plan is decomposed into sequenced TODOs. Each TODO is aligned with the human partner **before** implementation, and the alignment decisions are written to files (not left in the session) so they survive context compaction and hand off cleanly to another agent.

### Alignment standard (three dimensions)

For every TODO, align on:

1. **What the task does** - the goal and the problem it solves.
2. **Change scope** - what is in scope and what is explicitly out of scope.
3. **Concrete changes + resulting file structure** - files created/modified/deleted, and the file tree after the change.

### Alignment workflow

1. **Verify current state.** Do not trust the plan/handoff text as-is - it is often written against an older state. Use `grep`/`ls`/`Read` to read the actual code and confirm the description matches reality. Record any **baseline drift** (e.g. `shared/events-ipc.ts` already diverged from the plan's Task 5 text). This catches stale or misleading descriptions before they misdirect the work.
2. **Read the referenced plan/spec.** When a TODO says "execute `<plan>` Task N", open that task and read its exact contracts (types, SQL, skeletons, test cases).
3. **Organize the alignment** around the three dimensions above.
4. **Align via `AskUserQuestion`, one TODO at a time.** Start with one question; append follow-up questions for each decision point (naming, class structure, test strategy). Surface contradictions between the plan text and the verified baseline as explicit either/or choices, with the plan text beside the finding.
5. **Lock decisions.** Each answer becomes a concrete decision recorded in the spec.

### Artifacts (after alignment, before implementation)

6. **Update the plan/handoff.** Correct any description that misdirected the alignment (examples from the extension-migration handoff: `SessionService` -> `SessionPersistence`, `sessions:*` colon keys -> descriptive bare names, a stray `useStore` import removed, `prosemirror-state ^2.0.0` -> `^1.4.4` to match TipTap's resolved version). Add a `> **Spec (authoritative):** <path>` line at the top of the TODO pointing at the new spec.
7. **Write a spec** to `docs/superpowers/specs/<date>-<topic>.md`. The spec is self-contained and hand-off-able - an implementing agent needs nothing from the alignment session. Structure: task / scope / current baseline / data contracts / change details / resulting file structure / implementation steps / constraints & decisions / acceptance criteria.
8. **Keep both documents consistent.** The handoff summarizes and points at the spec; the spec carries the exact interfaces and baseline diffs the handoff omits.

### Implementation

9. **Implement against the spec.** The spec is the single source of requirements; do not re-derive decisions from the session.
10. **Verify against the spec's acceptance criteria.**

### Why

Alignment produces decisions. If those decisions live only in the session, context compaction loses them and the next agent re-derives - or contradicts - them. Writing them to the spec plus the updated plan makes the decision durable and the work resumable, the same principle as superpowers' SDD progress ledger.

## VS Code Setup

This repository includes workspace settings in `.vscode/settings.json`:

- **TypeScript SDK**: Pinned to workspace `node_modules/typescript/lib` (not VS Code's built-in).
- **Format on save**: Disabled (oxfmt runs via lint-staged on commit only).
- **Code actions on save**: Disabled (oxlint runs via lint-staged on commit only).

A launch configuration is also provided in `.vscode/launch.json` for attaching the debugger to the Electron main process on port 5858.

## CI/CD

The repository includes a CI workflow at `.github/workflows/ci.yml`. It validates type-checking, linting, formatting, and tests on each push/PR. The `version` file at the project root tracks the current release version.
