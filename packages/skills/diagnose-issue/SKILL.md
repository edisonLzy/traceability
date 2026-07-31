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

Read `metadata.stacktrace`, `metadata.message`, `metadata.context`, and `tags.appName`.

## 2. Locate the code

Parse the stacktrace's top frames. Open the files at the given `filename:lineno`. Identify the function and the failing expression.

## 3. Add temporary diagnostic instrumentation (optional)

If the root cause is unclear, wrap the suspected call site with `addBreadcrumb` (see the `trace` skill's `references/reporting-api.md`) to capture the inputs/state next time it runs. Deploy, let it reproduce, then re-fetch the issue events.

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
