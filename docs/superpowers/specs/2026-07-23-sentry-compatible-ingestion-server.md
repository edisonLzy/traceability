# Sentry-compatible Ingestion Server — V1 Production Architecture

**Date:** 2026-07-23  
**Status:** Approved design baseline  
**Implementation plan:** `docs/superpowers/plans/2026-07-23-sentry-compatible-ingestion-server.md`

## 1. Decision summary

Traceability will replace the current server implementation with a new, production-oriented **multi-project** monitoring service. It will accept standard Sentry JavaScript SDK envelopes through a normal DSN and provide durable asynchronous processing, event deduplication, Issue grouping, and a protected control API.

V1 deliberately handles only the `event` envelope item. The protocol parser, durable storage, queue contracts, and worker registry must nevertheless model an Envelope as a list of typed items so that `transaction`, `session`, `attachment`, `replay_*`, and other item types can be added without redesigning ingestion.

The existing Drizzle ORM remains the data-access layer. The database migration replaces the SQLite driver (`better-sqlite3` / `drizzle-orm/better-sqlite3`) with PostgreSQL (`pg` / `drizzle-orm/node-postgres`). This is a driver, schema, and asynchronous-call-model migration; it is not an ORM replacement.

This architecture borrows Relay's useful boundary—small, policy-enforcing ingress followed by asynchronous processing—without copying Self-hosted Sentry's Kafka, ClickHouse, Snuba, metrics, replay, or native-symbolication infrastructure.

## 2. Product boundary

### In scope for V1

- Standard Sentry DSN shape: `https://<publicKey>@<ingestHost>/<projectId>`.
- Standard ingest route: `POST /api/:projectId/envelope/`.
- Browser and Node JavaScript SDK error/message capture using their default Envelope transport. No custom Traceability transport, path `appId`, or browser Bearer token is required.
- Envelope structural parsing, request authentication, project policy lookup, size limits, project/IP rate limits, and server-side PII scrubbing.
- Durable ingestion acknowledgement: a Sentry-compatible `200 OK` means the sanitized envelope and its item records committed to PostgreSQL.
- Event normalization, idempotent event persistence, deterministic/versioned Issue fingerprints, and atomic Issue aggregation.
- `client_report` and unknown items are structurally accepted and recorded as unsupported outcomes; they are not processed in V1 and must not cause a valid `event` item in the same envelope to fail.
- A management API to create projects, create/revoke DSN keys, configure ingestion policy, list Issues/events, and run operational checks.
- PostgreSQL migrations, Redis-backed limits and job dispatch, dead-letter visibility, metrics, logs, health/readiness endpoints, backup policy, and integration/load tests.

### Explicitly out of scope for V1

- Processing `transaction`, `session`, `attachment`, `replay_event`, `replay_recording`, `profile`, `metrics`, native crash dumps, or logs.
- Full Sentry REST API or `sentry-cli` compatibility.
- Session replay, performance analytics, ClickHouse, Kafka/Redpanda, Snuba, Elasticsearch/OpenSearch, and Kubernetes.
- Multi-organization SaaS features: customer billing, self-service signup, organization-level RBAC, tenant-specific encryption keys, data residency, or multi-region replication.
- AI analysis in the ingestion transaction. AI is an optional future worker triggered only after an Issue has been stored.

### MVP API compatibility matrix

"Cover the MVP Sentry APIs" means every endpoint and protocol item explicitly listed below has implementation, contract tests, and documentation. It does **not** mean compatibility with Sentry's complete public REST API.

| Surface | Method and path | V1 behavior |
| --- | --- | --- |
| Sentry ingest | `POST /api/:projectId/envelope/` | Required. Authenticate DSN from request/envelope metadata, parse all item boundaries, process `event`, and safely ignore unsupported items. Return `200` only after PostgreSQL commits. |
| Legacy Sentry ingest | `POST /api/:projectId/store/` | Explicitly unsupported in V1. The supported JavaScript SDK version uses Envelope transport. Return documented `404`; do not silently accept an incompatible payload. |
| Health | `GET /health/live`, `GET /health/ready` | Required. Liveness is process health; readiness verifies PostgreSQL and migration compatibility. |
| Metrics | `GET /metrics` | Required Prometheus endpoint, network-restricted to operators. |
| Projects | `GET/POST /api/v1/projects`, `GET/PATCH /api/v1/projects/:projectId` | Required protected control API. |
| Project keys | `POST /api/v1/projects/:projectId/keys`, `GET /api/v1/projects/:projectId/keys`, `DELETE /api/v1/projects/:projectId/keys/:keyId` | Required DSN creation, inspection, and revocation. |
| Project policy | `GET/PATCH /api/v1/projects/:projectId/policy` | Required origin, quota, enabled item type, and scrub policy management. |
| Issues | `GET /api/v1/projects/:projectId/issues`, `GET /api/v1/issues/:issueId`, `GET /api/v1/issues/:issueId/events`, `PATCH /api/v1/issues/:issueId` | Required Issue/event inspection and lifecycle changes. |

All control APIs use a documented JSON response envelope and require management authentication. The public Sentry Envelope endpoint follows Sentry response conventions and never receives the control API response wrapper.

## 3. Operating target and capacity assumptions

V1 is a reliable internal platform, not an HA public SaaS. Its initial production profile is:

| Dimension | V1 target |
| --- | --- |
| Projects | 5–30 web/Node projects |
| Normal traffic | Up to 50,000 events/day |
| Burst traffic | 50 accepted events/second for 15 minutes |
| Retention | 30 days for events and sanitized envelopes |
| Ingest latency | P95 below 200 ms, excluding rejected requests |
| Processing latency | P95 below 60 seconds from durable acceptance to Issue update |
| Ingest availability | 99.9% monthly target for the API process and its dependencies |
| Recovery | RPO 15 minutes; RTO 4 hours |

At an estimated 8 KB average sanitized event, 50,000 events/day retained for 30 days is about 12 GB of payload. PostgreSQL heap/index/WAL overhead, temporary migration space, and backup headroom require at least 100 GB. The reference deployment reserves **4 vCPU, 16 GB RAM, and 200 GB SSD**.

The first scale-up threshold is either more than 200,000 events/day, more than 200 ingress events/second, queue processing age above 60 seconds for 15 minutes, or an events table consistently above 50 GB. At that point, split API and worker replicas, isolate PostgreSQL/Redis, and introduce monthly event partitions. Kafka and ClickHouse are not introduced until measured workload requires independent high-throughput fan-out or arbitrary analytics at more than roughly one million events/day.

## 4. Runtime architecture

```text
Sentry JavaScript SDK
  │  DSN Envelope
  ▼
Caddy / Nginx
  │  TLS, body cap, request ID
  ▼
Ingestion API (Fastify, stateless)
  ├─ parse path/auth/DSN and project policy
  ├─ decompress within bounded stream limits
  ├─ parse Envelope headers and item boundaries
  ├─ rate-limit by project key and IP
  ├─ scrub before any persistence
  └─ PostgreSQL transaction: envelopes + items + outbox
  │
  └── 200 only after commit

Outbox dispatcher ──► Redis / BullMQ ──► Item worker registry
                                          ├─ event handler (V1)
                                          ├─ transaction handler (future)
                                          ├─ replay handler (future)
                                          └─ attachment handler (future)
                                                   │
                                                   ▼
                                             PostgreSQL
                                      projects, events, issues, outcomes

Object storage (MinIO/S3): future source maps and attachments
Management API: protected by corporate SSO reverse proxy or a deployment admin token
```

There are three independently runnable Node roles: `api`, `dispatcher`, and `worker`. V1 may run each as one container, but they are separate processes and deployment units. The API never waits for source mapping, Issue grouping, notifications, or AI.

The process entry points remain intentionally flat: `src/app.ts`, `src/dispatcher.ts`, and `src/worker.ts`. `src/index.ts` stays as the default API entry point and delegates to `startApi` from `app.ts`; it exists for the package's existing development/start commands. A `commands/` directory is not introduced until the process count or command-specific shared code makes one useful.

## 5. Envelope and DSN contract

### Endpoint and authentication

The server accepts `POST /api/:projectId/envelope/`. A request identifies the public project key through the normal Sentry request metadata (`X-Sentry-Auth`, query credentials where supported) or through the envelope header `dsn`. The parser must reject conflicting credentials and reject a DSN whose project ID does not equal `:projectId`.

The `public_key` is an ingestion identity, not a secret. It maps a request to a project and policy. It never grants management access. Management endpoints reject DSN authentication and require either:

- an authenticated identity injected by the company SSO reverse proxy, or
- a deployment-scoped administrative bearer token stored only in server-side secrets for bootstrap/CLI use.

Every project key can be active, disabled, or revoked. Project policy contains allowed browser origins, rate limit/quota, item-size overrides within global maxima, sampling policy, and scrub rules.

### Bounded parsing requirements

The parser is byte-oriented. It must not implement an Envelope as `text.split("\\n")`: binary payloads and item headers with a `length` field make that unsafe. It parses the first JSON header, then each item header; if `length` is present it consumes exactly that many bytes, otherwise it consumes the newline-delimited payload.

V1 default guards:

| Guard | Limit |
| --- | --- |
| Compressed request body | 1 MiB |
| Decompressed envelope | 5 MiB |
| Item count | 20 |
| One item payload | 1 MiB |
| JSON nesting | 32 levels |
| Breadcrumbs | 100 |
| Stack frames per exception | 200 |
| String field before truncation | 16 KiB |

Supported content encodings are `identity`, `gzip`, `deflate`, and `br`; decompression is streamed and counted so a compressed bomb cannot allocate unbounded memory. Invalid JSON in an `event` item produces an item-level invalid outcome. Invalid Envelope framing rejects the request with `400`; global/request limits return `413`; a disabled/unknown key returns `403`; a nonrecoverable API overload returns `503`; project quotas return `429` with `Retry-After` and rate-limit headers.

### Extensible item registry

Parsing is independent from business processing:

```ts
interface ParsedEnvelope {
  header: EnvelopeHeader;
  items: ParsedEnvelopeItem[];
}

interface ParsedEnvelopeItem {
  sequence: number;
  type: string;
  header: Record<string, unknown>;
  payload: Uint8Array;
}

interface EnvelopeItemHandler {
  readonly itemType: string;
  validate(item: PersistedEnvelopeItem): Promise<ValidationResult>;
  process(item: PersistedEnvelopeItem): Promise<ProcessingResult>;
}
```

The registry contains `event` in V1. Unknown types are persisted as a sanitized item record with an `unsupported_item` outcome and end in `ignored`; they do not become silent data loss or force the endpoint to understand future protocols. Adding a new type later is a new handler, schema contract, queue name/concurrency policy, and test fixture—not a rewrite of the endpoint.

## 6. Data model and consistency contract

### Core entities

| Table | Responsibility |
| --- | --- |
| `projects` | Monitoring project and repository/release metadata. |
| `project_keys` | DSN public key lifecycle and project association. |
| `project_policies` | Origins, quotas, sampling, scrub configuration, and enabled item types. |
| `ingest_envelopes` | Sanitized, durable received envelope, request metadata, checksum, and acceptance status. |
| `ingest_items` | One typed item per parsed Envelope item; header, sanitized byte payload, sequence, state, retry count, and handler version. |
| `outbox` | Transactional hand-off from PostgreSQL to BullMQ. |
| `events` | Normalized event data, selected indexed columns, raw/normalized JSONB, and unique Sentry event ID. |
| `issues` | Versioned fingerprint aggregate with atomic counts and lifecycle state. |
| `processing_failures` | Final errors, retry history, and operator-visible dead-letter state. |
| `outcomes` | Accepted/filtered/invalid/rate-limited/unsupported item accounting. |
| `artifacts` | Future Source Map/object-storage metadata; no V1 symbolication dependency. |

`ingest_envelopes.raw_envelope` and `ingest_items.payload` contain the **sanitized** accepted representation. The unfiltered HTTP request exists only in memory while the ingress handler runs and is never written to logs, the queue, or the database.

### Idempotency and atomic aggregation

The processing guarantee is at-least-once. Event processing is idempotent:

1. The dispatcher can enqueue the same item more than once; its BullMQ job ID is the item UUID.
2. `events` has `UNIQUE(project_id, event_id)`.
3. The event worker inserts the Event and updates/creates the Issue in the **same PostgreSQL transaction**.
4. An Issue count increments only when the Event insert actually succeeds. A duplicate Event marks its item `processed_duplicate` and leaves aggregates unchanged.
5. New Issue creation uses `INSERT ... ON CONFLICT` on `(project_id, fingerprint, grouping_version)`; count/last-seen updates are SQL-side atomic expressions.

The initial grouping algorithm is `grouping_version = 1` and hashes exception type, normalized message, and the top in-app stack functions/files. Client-provided `fingerprint` takes precedence after validation. Release and environment are stored as dimensions, not fingerprint components, so a release does not fragment one code defect into many Issues.

## 7. Drizzle + PostgreSQL migration

Drizzle remains the only ORM/query builder. The migration changes both connection semantics and schema types:

```ts
// Remove
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

// Add
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
```

- Replace `better-sqlite3` and its type package with `pg` and `@types/pg`.
- Replace `sqliteTable` / `text` timestamp fields with `pgTable`, `uuid`, `timestamp({ withTimezone: true })`, `jsonb`, `bytea`, `integer`, and `bigint` where appropriate.
- Update `server/drizzle.config.ts` to `dialect: "postgresql"`, use `DATABASE_URL`, and generate migrations under the existing `server/drizzle/` directory.
- Replace synchronous Drizzle calls (`.all()`, `.run()`) with `await` and ensure service methods and routes are asynchronous.
- Use a singleton `pg.Pool`, bounded by `DATABASE_POOL_MAX`, with explicit graceful shutdown.
- Tests run against an isolated PostgreSQL database, not SQLite emulation. Test setup applies generated migrations, truncates all tables between tests, and destroys the pool afterward.

This is intentionally a breaking replacement of the prototype schema and endpoints. Existing SQLite data is not migrated because the current data model stores untrusted raw text, lacks DSN keys and durable item state, and does not meet the V1 contract.

## 8. Code and deployment structure

```text
server/
├── drizzle/                         # PostgreSQL migrations generated by Drizzle Kit
├── docker/
│   ├── Dockerfile
│   ├── compose.production.yml
│   └── postgres-backup/
├── src/
│   ├── index.ts                     # default API entry; delegates to app.ts
│   ├── app.ts                       # Fastify composition and API process startup
│   ├── dispatcher.ts                # PostgreSQL outbox → BullMQ process
│   ├── worker.ts                    # Envelope item worker process
│   ├── config/                      # validated environment configuration
│   ├── db/
│   │   ├── client.ts                # pg Pool + Drizzle client
│   │   ├── schema/
│   │   └── migrations.ts
│   ├── domains/
│   │   ├── projects/
│   │   ├── ingest/
│   │   │   ├── envelope-parser.ts
│   │   │   ├── auth.ts
│   │   │   ├── scrubber.ts
│   │   │   ├── persistence.ts
│   │   │   └── routes.ts
│   │   ├── processing/
│   │   │   ├── registry.ts
│   │   │   ├── event-handler.ts
│   │   │   └── worker.ts
│   │   ├── issues/
│   │   ├── outcomes/
│   │   └── artifacts/               # metadata only in V1
│   ├── infrastructure/
│   │   ├── queue/                   # BullMQ and transactional outbox
│   │   ├── rate-limit/               # Redis limiter + degraded fallback
│   │   ├── metrics/
│   │   ├── object-storage/
│   │   └── auth/
│   └── tests/
└── package.json
```

Required runtime dependencies are Fastify, `pg`, Drizzle, Redis/BullMQ, Pino/Fastify logging, JSON-schema validation for management endpoints, Prometheus metrics, and an S3-compatible client only for artifact metadata/object-storage readiness. The root workspace stays pnpm-based; no `npm` or `yarn` commands are introduced.

The recommended production deployment uses managed PostgreSQL with point-in-time recovery, managed Redis, and S3-compatible object storage. A single-host Compose reference is provided for internal deployment, but it must archive PostgreSQL backups/WAL off-host and is explicitly a single-host availability risk. Caddy/Nginx terminates TLS and enforces the outer request limit.

### Container image delivery contract

The server is distributed as one OCI image built by a multi-stage Dockerfile. It contains the compiled API, dispatcher, and worker programs; no source tree, development dependencies, SQLite database, or host bind mount is required at runtime.

- Default image command starts `node dist/index.js` (the API role).
- The same immutable tag starts `node dist/dispatcher.js` and `node dist/worker.js` in the other Compose services. There is no separate worker image.
- The image runs as a non-root user, exposes port `3000`, accepts only environment/configured secret inputs, and writes no application data to its filesystem.
- `DATABASE_URL`, `REDIS_URL`, `PUBLIC_INGEST_URL`, management-auth configuration, and observability settings are required external configuration. Secrets are never baked into the image.
- The repository provides `docker/compose.production.yml` for the reference stack and a `docker run` example for an API process backed by external PostgreSQL/Redis.
- The image build records an immutable version/revision label and is validated by a container smoke test before publishing.

## 9. Security, privacy, and backpressure

- Reject arbitrary management requests at the reverse proxy/management API boundary; only ingress accepts public DSN traffic.
- Apply global, project-key, and IP rate limits before durable persistence. Redis is the authoritative distributed limiter; Redis degradation switches to a stricter process-local limiter and emits an alert.
- Store only allowlisted request metadata. Do not log authorization headers, DSNs, cookies, event payloads, or unsanitized URLs.
- Scrub known sensitive keys (`authorization`, `cookie`, `password`, `token`, `secret`), sensitive URL query parameters, emails, phone numbers, and JWT-like values before durable storage. Enforce maximum string and collection sizes.
- Preserve original and normalized stack locations only after sanitization. Source code contexts and AI inputs are future opt-in data flows with their own scrub pass.
- If PostgreSQL cannot persist, return `503`; never return `200` for an uncommitted envelope. If the worker/queue is unavailable after PostgreSQL commits, leave the outbox record pending and continue dispatcher retries with exponential backoff.
- Shed load in this order: reject oversize input, enforce project/IP limits, reject new requests at the global cap, pause optional future processing. Error event durability is never displaced by AI or symbolication.

## 10. Operations and observability

The server exposes `/health/live`, `/health/ready`, and `/metrics`. Readiness requires database connectivity and that migrations match the application version; Redis is reported as degraded rather than making already-durable processing invisible.

Required metrics:

- request count/latency/body size by status and project-safe outcome;
- accepted, invalid, filtered, unsupported, and rate-limited item counts;
- outbox pending count and age; queue depth; oldest processing item age; dead-letter count;
- Event duplicate count, Issue grouping duration, PostgreSQL pool saturation, Redis failures, and scrub-rule matches;
- backup success age, migration version, and data-retention deletion count.

Alert on: API 5xx rate, ingestion P95 above 200 ms, oldest pending item above 60 seconds, dead-letter growth, DB connection exhaustion, database disk above 75%, backup older than 24 hours, and any migration failure. Logs are structured Pino records correlated with a request ID and envelope/item UUID, never event content.

## 11. Pressure-test contract

Load tests use k6 scripts under `server/load-tests/`. They send a captured, standards-compliant JavaScript SDK Envelope shape through a generated DSN; event IDs are unique, payload sizes approximate 8 KB, and the test asserts stored outcomes against the accepted response count.

| Test | Scenario | Required result |
| --- | --- | --- |
| CI smoke | 10 EPS for 60 seconds | No unexpected 5xx; all `200` responses become Events within 60 seconds. |
| V1 capacity | 50 EPS for 15 minutes (45,000 requests) | Ingest P95 below 200 ms, no unexpected 5xx, no lost `200` Event, and oldest pending item below 60 seconds after drain. |
| Burst protection | 100 EPS for 60 seconds against a 50 EPS policy | Process remains healthy; every response is either `200` or expected `429`; no unbounded queue/database growth. |
| Recovery under load | 25 EPS while Worker is stopped for 2 minutes, then restored | API keeps durable acceptance within configured capacity; backlog drains; every accepted Event is eventually represented once. |

The full 15-minute and recovery tests run against staging or a production-like Compose environment before release. CI runs the short smoke test on every server change and executes the full suite on release candidates.

## 12. Acceptance criteria

V1 is complete only when all of the following are demonstrated in CI and a production-like Compose environment:

1. A real `@sentry/browser` SDK, configured only with the generated DSN, sends `captureException`, receives `200`, and creates exactly one Event and Issue.
2. Every endpoint in the MVP API compatibility matrix has contract and authorization coverage; unsupported legacy `/store/` behavior is explicit and tested.
3. An Envelope with a binary length-delimited unsupported item plus a valid `event` item parses safely; the event processes and the unsupported item is observable as ignored.
4. Unknown/disabled/revoked DSN keys, conflicting DSNs, malformed frames, compressed bombs, over-limit requests, and disallowed origins receive the documented status without persisting unsanitized data.
5. Replaying a successful Envelope and redelivering its queue job create no duplicate Event or Issue count.
6. Killing the worker or Redis after `200`, then restoring it, eventually processes the committed item from the PostgreSQL outbox.
7. The OCI image builds once and launches API, dispatcher, and worker roles without source mounts; the Compose reference boots from that image, accepts a real SDK Event, and passes liveness/readiness checks.
8. The V1 capacity, burst-protection, and recovery load tests meet every threshold in the pressure-test contract.
9. PostgreSQL restore is rehearsed from the documented backup procedure and meets the RPO/RTO objective.
10. Static analysis, typecheck, unit tests, migration tests, real-SDK integration tests, container smoke tests, and load-test smoke tests pass.
