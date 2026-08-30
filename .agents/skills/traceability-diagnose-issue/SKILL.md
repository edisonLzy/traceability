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

> The CLI does not currently expose event payloads. To see a concrete event's stacktrace / `extra` / breadcrumbs:
>
> - **Inbox UI** — open the issue; the event payloads are rendered there.
> - **Server tRPC** — the `issues.events` procedure (`GET /api/trpc/issues.events?input=…` with the Bearer token from `~/.traceability/config.json`) returns the events with their `payload` (the original Sentry event JSON: `exception.values[].stacktrace.frames[]`, `tags`, `extra`, `breadcrumbs`). The CLI doesn't wrap it yet; if you need CLI access, add an `issue events <issueId>` command to `packages/cli/src/commands/issue.ts` (mirrors `issue show`).

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

The current Fastify/tRPC server does not implement the fix loop yet, so the
command returns exit code `2`. Keep the patch locally and apply it through the
normal review workflow.

## 6. Report

Tell the user which files were changed and that fix-loop submission is pending
server support.
