# CLI Metric and Trace Query Commands

**Date:** 2026-08-05
**Status:** Authoritative implementation specification
**Depends on:** server Metrics/Tracing support (`docs/superpowers/specs/2026-08-03-metrics-tracing.md`, landed)

## Task

Add `metric` and `trace` command groups to the `traceability` CLI so a user (or an agent driving the CLI) can query metric catalog/series and trace lists/trees through the protected tRPC management API.

## Scope

In scope:

- `metric list` — metrics catalog, mirroring `metrics.catalog`.
- `metric series` — one metric's time series, mirroring `metrics.series`, with type/unit auto-resolution.
- `trace list` — paginated trace segment list, mirroring `traces.list`.
- `trace show <traceId>` — full span tree, mirroring `traces.get`.
- Shared relative+ISO time-range parsing.
- Default machine-friendly (JSON) output; `--readable` for human tables/tree.

Out of scope:

- Mutations (no metric/trace delete, no resend).
- Pagination auto-follow loops; a single `--cursor` + `--limit` pass is enough.
- Anything beyond the four existing tRPC procedures' inputs/outputs.

## Current baseline

- `packages/cli` exposes `auth`, `config`, `project`, `issue`, `sourcemap` groups. Each group is one file in `src/commands/*.ts` registered in `src/index.ts` via `xxxCommand(program)`; commands call `getTrpcClient()` from `lib/trpc.ts` and render with `printJson`/`printTable` from `lib/output.ts`.
- Tests mock `../lib/trpc.js` with `vi.hoisted` fns (see `commands/project.test.ts`).
- Server already implements `metrics.catalog`, `metrics.series`, `traces.list`, `traces.get` under `/api/trpc`; all require a project id and default to the last 24h (max 30 days). `series` requires `name`, `type` (`counter|gauge|distribution`), `unit` (may be null), `resolution` (`1m|5m|1h|1d`); `catalog` supports `prefix`, `type`, cursor+limit. `list` procedures return `{ data, nextCursor }`; `traces.get` returns `{ traceId, roots, linkedEvents, metricCount }`.

## Command surface

Naming follows the existing singular style (`project`, `issue`). Every command takes `--project-id <id>` (required) unless noted, and `--readable` (see Output model).

```text
traceability metric list     [--project-id <id>] [--prefix <s>] [--type <counter|gauge|distribution>]
                             [--from <t>] [--to <t>] [--cursor <c>] [--limit <n>] [--readable]
traceability metric series   --name <s> [--type <t>] [--unit <u>] [--resolution <1m|5m|1h|1d>]
                             [--from <t>] [--to <t>] [--trace-id <id>] [--span-id <id>]
                             [--attr <k=v> ...] [--readable]
traceability trace list      [--project-id <id>] [--name <s>] [--op <s>] [--status <s>]
                             [--environment <s>] [--release <s>] [--from <t>] [--to <t>]
                             [--cursor <c>] [--limit <n>] [--readable]
traceability trace show <traceId>   [--project-id <id>] [--readable]
```

Defaults:

- `--limit` defaults to `50` (the server cap).
- `--resolution` defaults to `1h`.
- No `--from`/`--to` sends nothing (server default = last 24h).

## Output model

Default output is **machine-friendly**: `printJson` of the exact tRPC response shape. `--readable` switches to a human format. There is no `--json` flag.

| Command | Default (JSON) | `--readable` |
|---|---|---|
| `metric list` | `{ data, nextCursor }` | table `NAME / TYPE / UNIT / SAMPLES / LAST SEEN`; if `nextCursor`, print `(more — use --cursor <c>)` to stderr |
| `metric series` | `{ type, unit, points, summary }` | summary line + `BUCKET` + type-appropriate columns table |
| `trace list` | `{ data, nextCursor }` | table `TRACE ID / NAME / OP / STATUS / DURATION(ms) / START`; `nextCursor` hint to stderr |
| `trace show <traceId>` | `{ traceId, roots, linkedEvents, metricCount }` | ASCII span tree + footer `N linked events · M metrics` |

Series `--readable` tables:

- counter → columns `BUCKET SUM`; summary `sum`.
- gauge → columns `BUCKET LATEST MIN MAX AVG`; summary `latest min max avg`.
- distribution → columns `BUCKET COUNT SUM MIN MAX AVG P50 P95 P99`; summary `count sum min max avg p50 p95 p99`.

Trace tree rendering: one line per span, indented by depth, ordered as the server returns roots/children; format `{duration}ms {status} {op} {name}`. Spans with `orphaned: true` get an `[orphaned]` marker. Roots are printed first; after the tree, a footer line reports `linkedEvents.length` and `metricCount`. When the tree is empty (no spans), print `(no spans)`.

## Behavior details

### Time ranges (`lib/time.ts`)

`parseTimeRange(from?: string, to?: string): { from?: Date; to?: Date }` resolves each flag independently:

- Relative duration: `/^(\d+)(s|m|h|d)$/` → `now − n units`. `m` means minutes, `d` days.
- Anything else is passed to `new Date(...)` (ISO 8601 or epoch ms) and must be valid; an invalid value throws with the offending flag named.

Both flags are sent as ISO strings (`date.toISOString()`); the server coerces via `z.coerce.date()`. Empty/absent flags send nothing.

### `metric series` type/unit auto-resolution

`--type` and `--unit` are optional. If both are present, call `metrics.series` directly. Otherwise resolve by calling `metrics.catalog` with `prefix: name` and the provided filters, then filtering the returned `data` to candidates whose `name === name` and matching any provided `type`/`unit`:

- Exactly one candidate → use its `type`/`unit`.
- Zero → error naming the metric.
- More than one → error listing the candidates (`name type unit`) so the user can disambiguate.

### `--attr` parsing

`--attr` is repeatable (`--attr "key=value"`), max 10. Value is parsed as number if numeric (integer or float), else `true`/`false` if it matches, else string — matching the server's `attributeValue` union. Duplicate keys: last wins. Invalid values (e.g. empty key) throw before the request is sent.

### Errors

Reuse the existing `index.ts` error mapping (network, auth, CommanderError). A missing/invalid trace or metric name surfaces the tRPC error message and exit code 1 as today.

## Files

New:

```text
packages/cli/src/commands/metric.ts
packages/cli/src/commands/trace.ts
packages/cli/src/lib/time.ts
packages/cli/src/commands/metric.test.ts
packages/cli/src/commands/trace.test.ts
packages/cli/src/lib/time.test.ts
```

Edited:

- `packages/cli/src/index.ts` — import and register `metricCommand`, `traceCommand`.

`lib/output.ts` is unchanged; the new commands use `printJson`/`printTable` (plus the tree/footer rendering helpers kept local to `trace.ts`).

## Constraints and decisions

- Output defaults to JSON (machine/AI-friendly) so the CLI composes well when driven by agents; human output is opt-in via `--readable`. This is the opposite of the existing `project`/`issue` default (human table + `--json`); the new groups intentionally do not inherit `--json`.
- No cursor auto-pagination; one `--cursor`/`--limit` pass, matching the server contract.
- Auto-resolution only fills missing `type`/`unit`; it never invents a `name`.
- Trace tree never crosses project boundaries (server guarantee) — the CLI passes project id through.
- Command names are singular (`metric`, `trace`) to match `project`/`issue`.

## Testing

Follow `commands/project.test.ts`: `vi.hoisted` mocks for the relevant procedures, `vi.mock("../lib/trpc.js")`, `new Command().exitOverride()`, assert on the mocked procedure's args and on console output.

- `metric.test.ts`: list maps `--prefix`/`--type`/`--limit`/cursor; series passes name/type/unit/resolution; series auto-resolves type+unit from a single catalog candidate and errors on zero/ambiguous; `--attr` value typing (number/bool/string).
- `trace.test.ts`: list maps all filters + cursor/limit; show passes projectId+traceId; show `--readable` renders tree with orphan marker and footer.
- `time.test.ts`: relative durations (`1h`, `30m`, `7d`), ISO passthrough, invalid value error, absent flags → undefined.

Root `pnpm type-check`, `pnpm test`, and `pnpm build` pass.

## Acceptance criteria

- `metric list`, `metric series`, `trace list`, `trace show` call the corresponding tRPC procedures with the right inputs.
- Default output is JSON of the raw response; `--readable` produces the tables/tree above.
- Relative and ISO time flags resolve correctly and are sent as ISO strings.
- `metric series` works with only `--name` when the catalog is unambiguous and explains itself otherwise.
- All four commands work against a running server with seeded metric/trace data; root typecheck, tests, and build pass.
