---
name: traceability-diagnose-issue
description: Use when the user gives a Traceability issue id and asks to diagnose / fix / investigate it. Walks the agent through pulling the issue, locating the code, adding diagnostic breadcrumbs, and producing a patch.
---

# Diagnose Issue Skill

When the user says "诊断 / 修复 / 排查 issue <id>" or "investigate issue <id>", follow this workflow.

## 1. Fetch the issue

```bash
traceability issue show <id> --json
```

`issue show` returns the **issue row** (not the raw event): `id`, `projectId`, `title`, `type`, `status`, `eventCount`, `firstSeen`, `lastSeen`. The `title` is the aggregation key — for `captureMessage` events it's the message string, for exceptions it's derived from the error. There is **no** `metadata.*` / `tags.*` block in this response.

To pull the raw event payloads (stacktrace, `extra`, breadcrumbs):

```bash
traceability issue events <id> [--limit <n>] [--json]
```

Without `--json` this prints a table of up to 20 events with `eventId`, `eventTimestamp`, `receivedAt`, `level`, `environment`, and `release`. With `--json` it dumps the complete event rows including the original Sentry envelope payload (`exception.values[].stacktrace.frames[]`, `tags`, `extra`, `breadcrumbs`). Use `--limit` (1–100) to control how many events are returned.

Alternatively, open the issue in the **Inbox UI** — event payloads are rendered there.

## 2. Locate the code

Get the event payload (see step 1) and parse the stacktrace's top frames. Open the files at the given `filename` + `lineno` (Sentry frames carry `abs_path`, `filename`, `lineno`, `function`). Identify the function and the failing expression. If only `title` is available (no frames, e.g. a bare `captureMessage`), grep the codebase for the message string to find the call site.

## 3. Add temporary diagnostic instrumentation (optional)

If the root cause is unclear, wrap the suspected call site with `addBreadcrumb` (imported from `@tracerability/monitor`, see the `trace` skill's `references/reporting-api.md`) to capture the inputs/state next time it runs. Deploy, let it reproduce, then re-fetch the issue events.

## 4. Produce a fix

Edit the code to fix the root cause. Re-run the project's tests.

## 5. Submit the patch

```bash
git diff > ./fix.diff
traceability issue attach-patch <id>
```

The fix-loop commands (`fix-request`, `attach-patch`, `mark-fixed`) are not yet
implemented on the server and exit with code `2` and the message
`"attach-patch is not available on this server (v1)"`. Keep the patch locally
and apply it through the normal review workflow.

## 6. Report

Tell the user which files were changed and that fix-loop submission is pending
server support.
