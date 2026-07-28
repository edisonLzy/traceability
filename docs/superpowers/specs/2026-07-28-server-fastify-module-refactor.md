# Server Fastify Module Refactor

**Date:** 2026-07-28
**Status:** Approved

## Task

Refactor `server/src` around explicit Fastify plugins, feature-first modules, and centralized runtime composition while preserving every existing external behavior.

## Scope

- Preserve REST paths, tRPC router names and inferred public types, environment variables, database schema, queue topics, response shapes, and package command names.
- Keep the three flat process entry points: `app.ts`, `dispatcher.ts`, and `worker.ts`.
- Rename `domains` to `modules`.
- Split each module's `db.ts` into `schema.ts` and `repository.ts` where the module owns data access.
- Keep Zod transport schemas beside their tRPC procedures. `types.ts` contains only types shared by files in the same module.
- Do not introduce autoload, a third-party DI container, request-scoped service trees, or behavior changes.

## Architecture

The API registers plugins in `bootstrap/api.ts`. Root-scope plugins expose config, database, rate limiter, and an immutable API service registry. Module routers are encapsulated plugins and may use `app.services`; plain Services never depend on Fastify.

Framework-neutral PostgreSQL, Redis, BullMQ, and rate-limit implementations remain in `infrastructure`. API plugins wrap those implementations and own their Fastify lifecycle. Dispatcher and worker bootstrap files use the same infrastructure directly.

Runtime dependency composition is centralized:

- API dependencies are constructed in `plugins/services.ts` after config, database, and rate limiter plugins.
- Dispatcher dependencies are constructed in `bootstrap/dispatcher-runtime.ts`.
- Worker dependencies are constructed in `bootstrap/worker-runtime.ts`.

Runtime cross-module dependencies are constructor parameters with narrow interfaces declared next to the consuming Service. Runtime composition imports modules through their `index.ts`; Services may not import another module's repository or concrete Service.

Two persistence-only exceptions preserve database correctness:

- A module schema may import another module's schema to declare a database foreign key.
- `ProcessingRepository` may use ingest and issue schemas in one transaction because processing atomically changes records owned by all three modules.

## Resulting Structure

```text
server/src/
├── app.ts
├── dispatcher.ts
├── worker.ts
├── bootstrap/
│   ├── api.ts
│   ├── dispatcher-runtime.ts
│   ├── worker-runtime.ts
│   └── shutdown.ts
├── infrastructure/
│   ├── database/
│   ├── queue/
│   └── rate-limit/
├── modules/
│   ├── ingest/
│   ├── issues/
│   ├── operations/
│   ├── processing/
│   └── projects/
├── plugins/
│   ├── config.ts
│   ├── cors.ts
│   ├── database.ts
│   ├── error-handler.ts
│   ├── health.ts
│   ├── observability.ts
│   ├── rate-limiter.ts
│   └── services.ts
├── shared/
└── trpc/
```

Module defaults are `index.ts`, `schema.ts`, `repository.ts`, `service.ts`, `router.ts`, and `types.ts`; files are omitted when the module has no corresponding responsibility. Ingest keeps its dedicated parser and scrubber files.

## Data and Transport Contracts

- `ApiServices` contains application-scoped `projects`, `issues`, `ingest`, and `operations` Services.
- Fastify is augmented with `config`, `database`, `rateLimiter`, and `services` decorators.
- tRPC context preserves the current `config`, `database`, and `services` fields and obtains them from the Fastify instance.
- Ingest content parsers are registered inside the ingest router plugin so they affect only ingest routes.
- Repository classes receive `Database`; Service classes receive repositories and any narrow cross-module capability.
- tRPC input schemas remain in each module's `router.ts`; Services receive already validated typed inputs.

## Acceptance Criteria

- Existing unit and integration behavior remains unchanged.
- `buildApp` can use test overrides without opening real PostgreSQL or Redis connections.
- Service construction occurs only in the services plugin or non-API bootstrap runtime.
- API plugin dependencies fail during Fastify boot when missing.
- API, dispatcher, and worker close only the resources they own and shutdown remains idempotent.
- No imports remain from `src/domains` or `src/db`.
- `pnpm --filter @traceability/server test`, `typecheck`, and `build` pass.
