# Metrics and Trace/Span Implementation Plan

> **Spec (authoritative):** `docs/superpowers/specs/2026-08-03-metrics-tracing.md`

## Task 1: Protocol and schema foundation

- Upgrade Monitor Sentry dependencies and inspect the locked protocol types.
- Add Trace/Metric Drizzle schemas, Event Trace columns, indexes, Policy default/backfill, and a generated migration.
- Extend Envelope Item types and supported Item validation.

## Task 2: Durable processing

- Normalize transactions and both Span wire shapes into one idempotent Trace store.
- Normalize v2 `trace_metric` containers into idempotent Metric samples.
- Register worker topics and preserve existing retry/failure behavior.

## Task 3: Management queries

- Add Project-local Metrics catalog/series queries and type-specific SQL summaries.
- Add Trace list/detail queries, construct complete forests, mark orphans, and attach Event/Metric metadata.
- Register services in the API container and routers in the tRPC root.

## Task 4: Monitor and demos

- Export `startSpan`, Span types, and `metrics` from applicable Monitor entry points.
- Keep tracing sampling explicit.
- Add web and Electron demonstration calls that produce correlated Spans and Metrics.

## Task 5: Verification

- Add parser, ingestion, processing, query aggregation/tree, idempotency, Policy, and Monitor transport tests.
- Run package and root typecheck/test/build commands and fix all regressions introduced by this change.
