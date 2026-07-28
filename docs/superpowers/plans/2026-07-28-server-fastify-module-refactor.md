# Server Fastify Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the server around Fastify plugins, feature modules, repositories, and explicit runtime composition without changing existing behavior.

**Architecture:** API infrastructure is exposed through ordered root Fastify plugins; a services plugin is the API composition root. Dispatcher and worker use framework-neutral infrastructure through dedicated bootstrap runtimes. Modules contain transport, service, repository, schema, and shared types only as needed.

**Tech Stack:** TypeScript, Fastify 5, tRPC 11, Drizzle/PostgreSQL, Redis/BullMQ, Vitest.

## Global Constraints

- Preserve all external APIs, schemas, queue topics, environment variables, and command names.
- Use `pnpm` only, `import type` for pure type imports, oxlint, and oxfmt.
- Do not introduce autoload or a DI framework.
- Follow the authoritative spec at `docs/superpowers/specs/2026-07-28-server-fastify-module-refactor.md`.

---

### Task 1: Lock the Fastify plugin and runtime contracts

**Files:**
- Create: `server/src/__tests__/architecture.test.ts`
- Create: `server/src/types/fastify.d.ts`
- Create: `server/src/plugins/config.ts`
- Create: `server/src/plugins/database.ts`
- Create: `server/src/plugins/rate-limiter.ts`

**Interfaces:**
- Produces typed `app.config`, `app.database`, and `app.rateLimiter` decorators.
- Plugin options accept test overrides; plugins close only resources they create.

- [x] Write architecture/runtime tests that boot the plugins with overrides and assert decorations and close ownership.
- [x] Run the focused tests and confirm failure because the plugins do not exist.
- [x] Implement the three plugins and Fastify augmentation.
- [x] Run the focused tests and typecheck.

### Task 2: Introduce repositories and API service composition

**Files:**
- Create/modify module `schema.ts`, `repository.ts`, `service.ts`, `index.ts` files.
- Create: `server/src/plugins/services.ts`
- Modify: `server/src/trpc/context.ts`

**Interfaces:**
- Produces `ApiServices` with `projects`, `issues`, `ingest`, and `operations`.
- Services are plain classes; repositories own Drizzle queries.

- [x] Add focused plugin tests and a plugin boot test for singleton service decoration.
- [x] Confirm the tests fail before service composition exists.
- [x] Move queries to repositories and implement the services plugin in dependency order.
- [x] Run Service, tRPC, and typecheck tests.

### Task 3: Move domains to modules and encapsulate transports

**Files:**
- Move: `server/src/domains/**` to `server/src/modules/**`
- Modify: module routers and `server/src/trpc/app-router.ts`
- Create: `server/src/bootstrap/api.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- `bootstrapApi(app, options)` registers all API plugins in explicit dependency order.
- Ingest router owns its content-type parsers and reads `app.services.ingest`.

- [x] Add tests proving ingest parsers are scoped and external routes/tRPC behavior remains compatible.
- [x] Confirm the parser-scope test fails with the current global parser.
- [x] Move files, update imports, register module routers, and reduce `app.ts` to Fastify construction/startup.
- [x] Run runtime, ingest, tRPC, typecheck, and build checks.

### Task 4: Separate worker and dispatcher composition

**Files:**
- Create: `server/src/bootstrap/dispatcher-runtime.ts`
- Create: `server/src/bootstrap/worker-runtime.ts`
- Create: `server/src/bootstrap/shutdown.ts`
- Modify: `server/src/dispatcher.ts`
- Modify: `server/src/worker.ts`

**Interfaces:**
- Runtime factories expose `run/close` or `start/close` with idempotent shutdown.
- Entry points only load config, create a runtime, register signals, and start it.

- [x] Add lifecycle tests for idempotent close and resource ownership.
- [x] Confirm tests fail because runtime factories do not exist.
- [x] Move composition and processing failure persistence into the appropriate runtime/module services.
- [x] Run worker/dispatcher tests, typecheck, and build.

### Task 5: Compatibility and architecture audit

**Files:**
- Modify: `server/package.json` only if an explicit `fastify-plugin` dependency is required.
- Modify: tests and imports necessary for final compatibility.

**Interfaces:**
- No public interface changes.

- [x] Search for forbidden `src/domains`, `src/db`, and cross-module Service/repository imports; audit documented persistence exceptions.
- [x] Run server unit tests and PostgreSQL integration tests against a temporary PostgreSQL instance.
- [x] Run server typecheck and build.
- [x] Run lint/format checks without rewriting unrelated files.
- [x] Compare REST paths, tRPC router keys, environment variables, scripts, schema exports, and queue topics against the baseline.
