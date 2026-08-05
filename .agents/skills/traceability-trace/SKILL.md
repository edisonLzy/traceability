---
name: traceability-trace
description: Use when the user names a user flow / 链路 (登录流程, 下单流程, 发消息流程, …) and wants it instrumented end-to-end without manually tracing the code. The agent analyzes the codebase to map the flow, identifies the key positions, and auto-adds @tracerability/monitor reporting calls.
---

# Trace Skill

When the user says something like "给登录流程加埋点 / 排查用户登录链路 / instrument the checkout flow end-to-end" and names a **user flow (链路)** rather than a single function, follow this workflow.

Unlike instrumenting a single known call site, this skill instruments an **entire user flow**: you analyze the code yourself so the user doesn't have to trace it by hand.

## 0. Confirm the flow + boundaries

Restate the named flow as **entry trigger → desired outcome** (e.g. "用户登录：点击登录按钮 → 跳转首页并拿到用户信息"). Only ask the user when the entry point or the success/exit condition is genuinely ambiguous.

## 1. Verify the SDK is set up

Check that `init({ dsn })` is already wired at app entry (search for an `init(` import from `@tracerability/monitor` — browser, `electron-main`, or `electron-renderer` subpath).

- **Wired** → continue.
- **Not wired** → stop and tell the user to run the `setup` skill first. This skill only adds reporting calls; it does not install or configure the SDK.

## 2. Analyze the codebase and map the flow

Starting from the entry point, trace the chain through the code: handlers → state transitions → network calls → side effects → success and error exits. **Do not ask the user where things are** - read the code and follow the calls.

Produce an ordered list of **key positions** (`file:fn`) that bound the flow:

- **Flow entry** - the first function/handler invoked (form `onSubmit`, route loader, IPC handler, …).
- **Each major step / state transition** - validation, transform, store update.
- **Network-call boundaries** - before the request, on success, on error.
- **Branch points** - where the flow can diverge (e.g. 2FA vs. direct login).
- **Error paths** - every `catch` / failure return that exits the flow.
- **Flow exit (success)** - the final step that completes the flow (redirect, resolve, …).

This list is the output of this step - it replaces the user manually reading the code. Show it to the user before instrumenting.

## 3. Choose the API per position

See `references/reporting-api.md` for the full how-to. Summary (all from `@tracerability/monitor`):

- `setTag("flow", "<flow-name>")` - group every event in this flow under one tag (call at entry).
- `addBreadcrumb({ category, message, data })` - at entry and each step; attaches context to the next error.
- `captureMessage("<flow>-<step>", { level, tags: { flow }, extra })` - on each step's success and on validation-style non-throwing failures (see `examples/web-demo/src/register.ts`).
- `captureMessage(...)` + `captureException(err)` - on each real error path.
- `captureMessage("<flow>-done", { level: "info", tags: { flow }, extra })` - at the exit, with timing in `extra`.

**Counting vs. observing — pick the right tool:**

- Use **`metrics.count(name, 1, { attributes })`** when the goal is "how many times did this happen" (e.g. messages sent per day, login attempts). Time-series data, queryable via `metrics.series` with `resolution: "1d"`. Does NOT create Issues.
- Use **`captureMessage`** when you want to *observe* a step happened and may need to correlate it with errors or see context in the Inbox.
- When in doubt: if it's a counter/gauge/distribution → `metrics`; if it's an event you'd want to click into → `captureMessage`.

Use stable, kebab-case, feature-prefixed message strings so events aggregate (see `references/reporting-api.md` § Event type naming). For metric names, use `dot.separated.lowercase` (e.g. `chat.message.sent`).

## 4. Instrument

Add the calls at each key position from step 2.

- Plain modules: `import { addBreadcrumb, captureException, captureMessage, setTag } from "@tracerability/monitor";`
- React components: `import { useMonitorTag } from "@tracerability/monitor/react";` (or wrap the flow root with `MonitorErrorBoundary`).

Minimal shape (full worked example in `references/reporting-api.md`):

```ts
import { addBreadcrumb, captureException, captureMessage, setTag } from "@tracerability/monitor";

async function login(email: string, password: string) {
  setTag("flow", "login");
  addBreadcrumb({ category: "login", message: "submit start", data: { email } });
  try {
    const res = await api.post("/login", { email, password });
    captureMessage("login-api-ok", { level: "info", tags: { flow: "login" }, extra: { userId: res.id } });
    // …store token, redirect…
    captureMessage("login-done", { level: "info", tags: { flow: "login" }, extra: { userId: res.id } });
  } catch (err) {
    captureMessage("login-failed", { level: "error", tags: { flow: "login" }, extra: { email, error: String(err) } });
    captureException(err);
    throw err;
  }
}
```

## 5. Verify

Trigger the flow once end-to-end. Confirm the events appear in the Inbox UI, or:

```bash
  traceability issue list --project-id <projectId>
```

Check that the whole flow's events share the `flow: <flow-name>` tag and aggregate into issues by message/fingerprint.

## 6. Commit

```bash
git add -A
git commit -m "feat: instrument <flow> flow"
```

Tell the user which key positions were instrumented and that the flow is now observable end-to-end in the Inbox.
