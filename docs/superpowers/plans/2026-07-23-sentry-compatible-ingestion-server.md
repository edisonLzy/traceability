# Sentry-compatible Ingestion Server — Implementation Plan

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-23-sentry-compatible-ingestion-server.md`

**Goal:** Replace the prototype server with a PostgreSQL-backed, production-oriented Sentry JavaScript SDK ingestion service. V1 processes only `event` envelope items, while parser, persistence, and workers stay extensible for future item handlers.

**Execution rule:** Complete one task at a time. Keep the spec authoritative, update this plan when a task reveals baseline drift, and do not modify historical plans/specs. The current prototype is not a compatibility contract.

## Task 1 — Runtime foundation and PostgreSQL migration

**What it does:** Establish the production runtime and remove SQLite as an architectural dependency.

**Scope:** Fastify application skeleton, validated configuration, PostgreSQL Drizzle client/schema/migrations, test database lifecycle, Docker assets, and health endpoints. No ingest route yet.

**Files:**

- Modify: `server/package.json`, `server/drizzle.config.ts`, `server/tsconfig*.json`, `pnpm-lock.yaml`.
- Create: `server/src/app.ts`, `server/src/config/*`, `server/src/db/schema/*`, `server/src/db/client.ts`, `server/src/db/migrations.ts`, `server/docker/*`, `server/src/tests/setup/*`.
- Delete at cutover: SQLite client/schema and Express-only middleware/routes after no imports remain.

**Acceptance:** generated PostgreSQL migrations apply to an isolated test database; API starts and returns liveness/readiness; API fails readiness for unavailable DB; pool closes gracefully.

## Task 2 — Projects, DSN keys, policies, and management authentication

**What it does:** Makes a monitoring project and its public ingestion identity first-class.

**Scope:** projects, project keys, policy schema, DSN generation/revocation, management route protection, and project policy cache. No event processing.

**Files:** create `server/src/domains/projects/*`, `server/src/infrastructure/auth/*`, `server/src/infrastructure/rate-limit/*`, and tests.

**Acceptance:** a project generates a normal DSN; a disabled/revoked key is rejected; management routes cannot be accessed with a DSN; configuration validates allowed origins and quotas.

## Task 3 — Safe, extensible Envelope ingress

**What it does:** Accepts real Sentry SDK Envelopes and persists sanitized parsed items without blocking on business processing.

**Scope:** byte-based bounded parser; content encoding; DSN extraction; auth consistency; limits; scrubber; outcomes; `ingest_envelopes`, `ingest_items`, and transactional outbox persistence; `POST /api/:projectId/envelope/`.

**Files:** create `server/src/domains/ingest/*`, `server/src/domains/outcomes/*`, parsing fixtures, and route/integration tests.

**Acceptance:** real Browser SDK sends a valid event with a generated DSN and receives `200`; binary length items parse correctly; malformed/oversized requests never persist; valid event plus unknown item persists and returns a successful outcome.

## Task 4 — Outbox, Redis dispatch, and worker registry

**What it does:** Converts durable accepted items into at-least-once asynchronous jobs without a loss window.

**Scope:** outbox dispatcher, BullMQ connection, handler registry contract, retry/backoff, item status transitions, dead-letter records, queue/processing health metrics.

**Files:** create `server/src/infrastructure/queue/*`, `server/src/domains/processing/{registry,worker}.ts`, top-level `server/src/dispatcher.ts` and `server/src/worker.ts`, and tests.

**Acceptance:** workers can restart safely; Redis outage after `200` leaves rows pending and later dispatches them; repeated dispatches do not duplicate work; terminal failure appears in `processing_failures`.

## Task 5 — Event handler, idempotency, and Issue grouping

**What it does:** Turns one persisted `event` item into normalized Event and Issue records.

**Scope:** event validation/normalization, grouping v1, unique Event insertion, atomic Issue upsert/counting, Issue/event management reads, representative event selection, and status transitions.

**Files:** create `server/src/domains/processing/event-handler.ts`, `server/src/domains/issues/*`, management routes, and transaction/concurrency tests.

**Acceptance:** duplicate Event IDs cannot increment Issue counts; concurrent same-fingerprint Events produce one Issue; grouping version is persisted; client fingerprint semantics are covered; unsupported item types remain ignored rather than accidentally processed.

## Task 6 — Operational hardening and deployment

**What it does:** Makes the service deployable and diagnosable at the V1 capacity target.

**Scope:** one multi-stage OCI image for API/dispatcher/worker roles; Compose reference deployment; reverse-proxy configuration; metrics; structured logging/redaction; readiness/degradation behavior; data retention job; backup/restore runbook; and operator dashboard queries.

**Files:** create/update `server/docker/*`, `server/docs/*` or root operational docs, metrics infrastructure, retention command, and deployment tests.

**Acceptance:** the same immutable image launches all three roles without source mounts; Compose boots from the image and passes health checks; metrics/alerts listed in the spec are exposed; an off-host backup procedure is documented and rehearsed; retention deletes only eligible data; log-redaction tests prove payloads/tokens are absent.

## Task 7 — Compatibility, failure, and capacity verification

**What it does:** Proves the design contracts before production handoff.

**Scope:** MVP API contract matrix; captured SDK fixtures; real-SDK integration suite; security regression suite; Worker/Redis/PostgreSQL failure tests; k6 smoke, capacity, burst, and recovery tests; and release checklist.

**Files:** create `server/src/tests/fixtures/*`, `server/src/tests/integration/*`, `server/load-tests/*`, and `server/docs/release-checklist.md`.

**Acceptance:** every acceptance criterion in the authoritative spec has evidence in CI or a recorded staging run; the full 50 EPS 15-minute and recovery tests run before release.

## Resulting file structure after the plan

```text
server/
├── drizzle/
├── docker/
├── load-tests/
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── dispatcher.ts
│   ├── worker.ts
│   ├── config/
│   ├── db/
│   ├── domains/{ingest,issues,outcomes,processing,projects,artifacts}/
│   ├── infrastructure/{auth,metrics,object-storage,queue,rate-limit}/
│   └── tests/
└── docs/
```
