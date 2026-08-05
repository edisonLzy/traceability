# Reporting API reference (for flow instrumentation)

How to use `@tracerability/monitor`'s methods when instrumenting a **user flow / 链路**. This is the doc the `trace` skill defers to for API usage. Canonical worked example: `examples/web-demo/src/register.ts`.

> Prerequisite: `init({ dsn })` must already be called once at app startup. If it isn't, run the `setup` skill first. This skill only adds reporting calls - it does not install or configure the SDK.

## Method quick reference

The SDK is `@tracerability/monitor`; every method below exists on the root (`browser`), `/electron-main`, and `/electron-renderer` subpaths unless noted.

| Method | Signature | Use at which trace position |
|---|---|---|
| `setTag` | `setTag(key: string, value: string)` | Flow entry - `setTag("flow", "<name>")` groups every event in this flow. |
| `addBreadcrumb` | `addBreadcrumb({ category, message, level?, data? })` | Entry + each step - leaves a trail the next error event carries. |
| `captureMessage` | `captureMessage(msg, opts?)` | Each step's success (`<flow>-<step>`) and failure (`<flow>-<step>-failed`), passed as the message. |
| `captureException` | `captureException(err)` | Every real error path - reports the error with stacktrace. |
| `setContext` | `setContext(key, obj)` | Attach structured state (e.g. the current request) to subsequent events. |
| `MonitorErrorBoundary` | `(appName?, fallback, children, onError?)` | React only (`@tracerability/monitor/react`) - wrap a flow's root to capture render errors. |
| `useMonitorTag` | `() => (key, value) => void` | React only (`@tracerability/monitor/react`) - a hook-wrapped `setTag`. |

Import:

```ts
import { addBreadcrumb, captureException, captureMessage, setTag, setContext } from "@tracerability/monitor";
```

> There is **no** `report` / `reportPerformance` / `setApp` / `useMonitorReport` in this SDK. Flow-step events are `captureMessage` calls; timing rides in the message's `extra`. (If the SDK later grows a `report` API, prefer it for step events — but today it does not exist.)

## `captureMessage` options

`captureMessage(msg, opts?)` — `opts` is a Sentry `CaptureContext` (or string = a scope). Useful fields:

- `level: "info" | "warning" | "error"` — drives the event level. Use `info` for step success, `warning` for validation failures, `error` for real failures.
- `tags: { flow: "<name>" }` — the flow tag; also any other keys you want filterable.
- `extra: { … }` — structured payload; every field lands on the event (e.g. `userId`, `email`, `register_total_ms`).
- `message` becomes the issue's fingerprint basis (title), so make it a stable `<flow>-<step>` string.

## The flow-instrumentation pattern

A flow is a chain of steps. Instrument every step the same way:

1. **Entry** - `setTag("flow", <name>)` + `addBreadcrumb(...)` with the inputs.
2. **Each step success** - `captureMessage("<flow>-<step>", { level: "info", tags: { flow }, extra: {...} })`.
3. **Each step failure** - for a thrown error, `captureMessage("<flow>-<step>-failed", { level: "error", tags: { flow }, extra: {..., error} })` + `captureException(err)`. For a validation rejection that doesn't throw, `captureMessage(...)` with `level: "warning"` is enough.
4. **Exit (success)** - `captureMessage("<flow>-done", { level: "info", tags: { flow }, extra: {...} })`; include elapsed ms in `extra` for end-to-end timing.

The `flow` tag is what lets you filter the Inbox to one end-to-end trace. The stable `<flow>-<step>` message is what lets steps aggregate into issues.

## Event type naming

Use `kebab-case`, feature-prefixed, action-suffixed message strings:

- `<feature>-<action>` for success: `message-sent`, `login-api-ok`
- `<feature>-<action>-failed` for failure: `message-send-failed`, `login-api-failed`
- `<feature>-<state>` for state: `agent-status-change`, `ws-disconnected`

Avoid generic messages like `log` or `event` - they won't aggregate cleanly. For a flow, prefix every step's message with the flow name (e.g. `login-validate-failed`, `login-api-ok`) so all steps of one flow cluster together.

## Worked example: login flow

Flow: 表单提交 -> 校验 -> POST /login -> 存 token -> 跳转首页.

```ts
import { addBreadcrumb, captureException, captureMessage, setTag } from "@tracerability/monitor";

async function login(email: string, password: string) {
  setTag("flow", "login");
  addBreadcrumb({ category: "login", message: "submit start", data: { email } });
  const t0 = performance.now();

  // Step 1: client-side validation
  if (!email || !password) {
    captureMessage("login-validate-failed", {
      level: "warning",
      tags: { flow: "login" },
      extra: { email },
    });
    throw new Error("missing credentials");
  }

  // Step 2: API call
  try {
    const res = await api.post("/login", { email, password });
    captureMessage("login-api-ok", {
      level: "info",
      tags: { flow: "login" },
      extra: { userId: res.id },
    });

    // Step 3: persist token
    localStorage.setItem("token", res.token);
    captureMessage("login-token-stored", {
      level: "info",
      tags: { flow: "login" },
      extra: { userId: res.id },
    });

    // Step 4: exit (success)
    captureMessage("login-done", {
      level: "info",
      tags: { flow: "login" },
      extra: { userId: res.id, login_total_ms: performance.now() - t0 },
    });
    router.push("/home");
  } catch (err) {
    captureMessage("login-api-failed", {
      level: "error",
      tags: { flow: "login" },
      extra: { email, error: String(err) },
    });
    captureException(err);
    throw err;
  }
}
```

Each `captureMessage` is one event in the Inbox; all share `flow: login`; the `login-*-failed` messages aggregate into issues you can drill into.

## React components

Inside a React component, use the hooks from `@tracerability/monitor/react`:

```tsx
import { MonitorErrorBoundary, useMonitorTag } from "@tracerability/monitor/react";

function LoginForm() {
  const setTag = useMonitorTag();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTag("flow", "login");
    captureMessage("login-submit", {
      level: "info",
      tags: { flow: "login" },
      extra: { email },
    });
    // …
  }
  // …
}

// Wrap a flow's root component to capture render errors as part of the trace:
<MonitorErrorBoundary appName="login" fallback={<ErrorUI />}>
  <LoginForm />
</MonitorErrorBoundary>
```

There is no `useMonitorReport` — for a step event from a component, call `captureMessage` (imported from the root `@tracerability/monitor`) directly.

## metrics API

用于**计数、度量、分布**场景（不产生 Issue，直接按时间序列聚合）。适合：
- 每日/每小时事件计数（消息数、登录次数）
- 数值指标（延迟、队列长度）
- 统计分布（响应时间 p50/p95/p99）

Import:

```ts
import { metrics } from "@tracerability/monitor";
```

### 三个 API

| API | 内部 type | 适用场景 |
|---|---|---|
| `metrics.count(name, value, options?)` | `counter` | 计数，如消息发送次数 |
| `metrics.gauge(name, value, options?)` | `gauge` | 当前值，如在线人数、队列深度 |
| `metrics.distribution(name, value, options?)` | `distribution` | 延迟/时长分布，自动计算 p50/p95/p99 |

`value` 默认为 1（`count` 时可省略）。

### options

```ts
metrics.count('chat.message.sent', 1, {
  unit: 'none',                        // 可选，传给 series 查询时需要对应
  attributes: {                        // 可选，最多 10 个，支持过滤/分组
    sessionType: 'private',
  },
});
```

### 命名约定

使用 `dot.separated.lowercase`（与 `captureMessage` 的 kebab-case 区分）：

- `chat.message.received`
- `chat.message.send.attempt`
- `chat.message.send.success`
- `chat.message.send.failed`

### 查询方式

通过 tRPC Panel（`http://localhost:3000/trpc-panel?path=metrics`）或 tRPC client：

1. **`metrics.catalog`** — 列出项目下所有已采集的 metric 名称、类型、unit
   - 参数：`projectId*`, `prefix`, `type`, `cursor`, `limit`
2. **`metrics.series`** — 查询某个 metric 的时间序列数据
   - 参数：`projectId*`, `name*`, `type*`, `unit*`（无 unit 传 `null`）, `resolution*`（`"1m"/"5m"/"1h"/"1d"`）, `from`, `to`, `attributes`
   - counter 返回 `points[{ bucket, sum }]` + `summary.sum`
   - gauge 返回 `points[{ bucket, latest, min, max, avg }]`
   - distribution 返回 `points[{ bucket, count, sum, min, max, avg, p50, p95, p99 }]`

### 工作原理

`metrics.count/gauge/distribution` → 发出 `trace_metric` envelope item（`version: 2`）→ server 存入 `metric_samples` 表 → 可通过 `metrics.series` 按任意时间粒度聚合查询。

---

## Choosing `captureMessage` vs `captureException` vs `addBreadcrumb` vs `metrics`

- **`addBreadcrumb`** - "what just happened" context that rides along on the *next* error. Cheap; use liberally at every step. Does not create an issue by itself.
- **`captureMessage`** - a discrete event you want to see/count in the Inbox (step reached, step failed). Creates an issue keyed by its message/fingerprint.
- **`captureException`** - an actual error with a stacktrace. Always pair it with a `captureMessage(...-failed)` so the failure is also visible as a typed event, not only as an error issue.
- **`metrics.count/gauge/distribution`** - time-series data, does NOT go to the Inbox. Use when the goal is "how many times did this happen" or "what is this value over time". Do not use `captureMessage` to simulate a counter — use `metrics.count` instead.
