# Metrics and Trace/Span Support

**Date:** 2026-08-03
**Status:** Authoritative implementation specification
**Implementation plan:** `docs/superpowers/plans/2026-08-03-metrics-tracing.md`

## Task

Upgrade `@traceability/monitor` to the current Sentry telemetry protocol and extend the server so it can ingest, normalize, store, and query `startSpan` traces and `metrics.count`, `metrics.gauge`, and `metrics.distribution` samples.

## Scope

In scope:

- Sentry Envelope Items `transaction`, `span`, and `trace_metric`.
- Project-local Trace lists and complete Trace trees.
- Metric catalog, time series, and type-specific summaries.
- Error Event correlation through `trace_id` and `span_id`.
- Monitor exports for tracing and Metrics with explicit trace sampling.

Out of scope:

- Legacy `statsd` Metric Items, cross-Project Trace assembly, UI work, alerting, SLOs, topology, and long-term rollups.

## Current baseline

- Ingest only processes `event`, `replay_event`, and `replay_recording`; other Item types are persisted as unsupported.
- The worker registry has handlers only for those three Item types.
- PostgreSQL has no normalized Span or Metric tables, and Events do not index Trace context.
- Monitor uses Sentry Browser/Core/React 8.55.x and Electron 5.12.x and does not export `startSpan` or `metrics`.
- Project Policy defaults to `event` only.

## Data contracts

### Trace spans

Every transaction root, transaction child Span, standalone Span, and streamed v2 Span is normalized into `trace_spans` with Project, source Item, Trace/Span/parent IDs, name, op, status, segment flag, timestamps, duration, release, environment, attributes, and measurements. `(project_id, trace_id, span_id)` is unique.

Static `transaction` Items derive the root identifiers from `contexts.trace` and children from `spans[]`. A root has `is_segment = true`. Standalone/v2 Spans preserve the SDK's segment flag.

### Metric samples

`trace_metric` must be a version 2 JSON container whose header `item_count` equals `items.length`. Each item has a finite timestamp/value, non-empty name, type `counter | gauge | distribution`, optional unit, a 32-character hexadecimal `trace_id` (the empty SDK fallback is stored as null), optional 16-character hexadecimal `span_id`, and typed attributes. `(ingest_item_id, sample_index)` is unique.

### Management API

- `metrics.catalog`: Project/time/name-prefix/type filters with cursor pagination.
- `metrics.series`: Project/name/type/unit/time/resolution plus optional Trace, Span, and at most ten typed attribute equality filters.
- `traces.list`: Project/time/name/op/status/environment/release filters with cursor pagination.
- `traces.get`: Project + traceId returning roots, nested children, orphan markers, linked Event summaries, and Metric count.

Default query range is the last 24 hours; explicit ranges may not exceed 30 days. Resolutions are `1m`, `5m`, `1h`, and `1d`.

Metric aggregation:

- counter: `sum`.
- gauge: `latest`, `min`, `max`, `avg`.
- distribution: `count`, `sum`, `min`, `max`, `avg`, `p50`, `p95`, `p99`.

## Change details

- Add Drizzle schemas and a generated PostgreSQL migration for `trace_spans`, `metric_samples`, Event Trace columns, indexes, and Policy defaults/backfill.
- Extend ingest JSON preparation and scrubbing for the new Item types. Malformed supported Items become `invalid`; disabled types remain `ignored`.
- Add idempotent processing handlers and register their BullMQ topics.
- Add Metrics and Traces repositories/services/routers to the API container and worker composition.
- Upgrade Monitor to Browser/Core/React 10.69.x and Electron 7.16.x; export tracing and Metrics from applicable entry points without setting a default trace sample rate.
- Update demos with explicitly sampled Span and Metric examples.

## Resulting server structure

```text
server/src/modules/
├── ingest/                 # extended Item validation and dispatch
├── metrics/{schema,repository,service,router}.ts
├── traces/{schema,repository,service,router}.ts
└── processing/             # Event + transaction/span/metric handlers
```

## Constraints and decisions

- `trace_metric` is the only custom Metrics wire protocol supported.
- Transaction `measurements` are retained on the root Span but are not included in `metrics.series`.
- Existing Policy arrays are preserved and receive `transaction`, `span`, and `trace_metric`; replay settings are not changed.
- Trace queries never cross Project boundaries.
- Trace sampling is always explicitly configured by the application.

## Acceptance criteria

- Valid new Items finish processing and invalid/disabled Items receive the correct disposition.
- Worker retries do not duplicate Spans or Metric samples.
- Query results match the aggregation and tree contracts above.
- Errors, Metrics, and Spans can be joined by Project and Trace context.
- A real Monitor transport test observes `transaction`/`span` and `trace_metric` Envelopes with active Trace linkage.
- Root typecheck, test, and build commands pass.
