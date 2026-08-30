# server/load

Load / performance testing scripts for the traceability **server** (Fastify + PostgreSQL, running on `PORT` 3000 by default). These are **not** unit or integration tests (`server/src/__tests__/…` covers those) — the scripts here spin up sustained traffic against a running server to measure ingest throughput, tail latency, and error rate under load.

## Layout

```
server/load/
├── CLAUDE.md      # this file
└── k6/            # k6 (https://k6.io) scenarios
    └── envelope.js
```

One tool per subdirectory. Today only `k6/` exists. If a different runner is ever added (wrk, Vegeta, Locust, …), give it its own sibling directory rather than mixing tools inside `k6/`.

## What `k6/envelope.js` does

Drives the Sentry-compatible envelope ingest path — the hottest write path in the server:

```
k6 VUs --POST /api/{sentryProjectId}/envelope/--> Fastify ingest --> Postgres
```

Flow:

1. `setup()` calls the tRPC mutation `POST /api/trpc/projects.create` with a user JWT from `ACCESS_TOKEN` to provision a fresh project (`slug: k6-<timestamp>`), returning `{ project, key, dsn }`.
2. Each iteration builds a Sentry envelope (headers line + `event` item header + error payload) with a unique 32-hex `event_id` derived from `Date.now()` + `__VU` + `__ITER`, then POSTs it as `application/x-sentry-envelope`.
3. A `constant-arrival-rate` executor holds a steady request rate regardless of latency (open model), so the run measures **server capacity**, not client back-pressure.

### Environment variables

| Var            | Default                 | Meaning                                                  |
| -------------- | ----------------------- | -------------------------------------------------------- |
| `TARGET_URL`   | `http://127.0.0.1:3000` | Server base URL                                          |
| `ACCESS_TOKEN` | — (required)            | User access JWT for the tRPC project creation mutation   |
| `RATE`         | `50`                    | Requests per second                                      |
| `DURATION`     | `15m`                   | Test duration (any k6 duration string, e.g. `30s`, `1h`) |

`preAllocatedVUs` / `maxVUs` scale with `RATE` (`max(20, rate)` / `max(100, rate * 3)`) so short warmups don't starve the arrival-rate executor at higher rates.

### Thresholds (pass/fail gates)

Defined in `options.thresholds`:

- `checks: rate>0.995` — ≥ 99.5 % of envelopes accepted after durable commit (HTTP 200).
- `http_req_failed: rate<0.01` — < 1 % transport-level failures.
- `http_req_duration: p(95)<200` — p95 end-to-end request time under 200 ms.

k6 exits non-zero if any threshold breaks, which is what makes this safe to wire into CI as a perf gate.

## Running

Prereqs: [`k6` installed](https://grafana.com/docs/k6/latest/set-up/install-k6/) (`brew install k6` on macOS) and a running server. Nothing in this directory is compiled or type-checked by `pnpm build` / `pnpm type-check`; k6 executes the `.js` files directly with its own JS runtime (goja), not Node.

```bash
# 1. Start the server in one shell (from repo root)
cd server && pnpm dev

# 2. Run the scenario in another shell
cd server/load/k6
ACCESS_TOKEN=<access-jwt> k6 run envelope.js

# Higher rate / shorter smoke run
ACCESS_TOKEN=<access-jwt> RATE=200 DURATION=30s k6 run envelope.js

# Point at a deployed environment
ACCESS_TOKEN=<access-jwt> TARGET_URL=https://traceability.example.com k6 run envelope.js
```

Do **not** run this against production Postgres — each `setup()` creates a real project row and the run writes real issues/events. Use `compose.test.yml` or a dedicated load-test environment.

## Conventions for adding scenarios

- **One scenario per file**, named after the endpoint or workflow it exercises (`envelope.js`, `issues-list.js`, `replay-upload.js`, …). Keeps `k6 run <file>` unambiguous.
- **All tunables via `__ENV`** with sensible defaults so `k6 run <file>` works out of the box for a smoke test; overrides drive it harder.
- **Declare thresholds** — a load script without pass/fail gates isn't a regression test, it's a curiosity. Prefer p95/p99 latency + error-rate thresholds sourced from the current SLO, not aspirational numbers.
- **Provision your own fixtures in `setup()`** rather than assuming pre-seeded data; makes runs reproducible across environments.
- **Keep IDs collision-free under high concurrency** — mix `Date.now()`, `__VU`, `__ITER` like `envelope.js` does. Two VUs firing in the same millisecond is normal at `RATE >= 100`.
- **Use an open-model executor** (`constant-arrival-rate`, `ramping-arrival-rate`) for capacity/SLO tests; use a closed model (`constant-vus`, `ramping-vus`) only when you're specifically modelling a fixed pool of clients.

## Not covered here

- Server correctness / API contract → `server/src/__tests__/` (vitest).
- SDK-side perf (browser metrics, transport back-pressure) → `packages/monitor`.
- Front-end / Electron perf → out of scope; measure in the app itself.
