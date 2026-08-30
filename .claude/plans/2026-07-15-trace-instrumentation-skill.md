# Plan: `traceability-trace` skill — 链路自动埋点

## 解读说明（重要）

你开头说"CLI"，但后续三次说"skill"，并让我参考 `setup` 这个 **Skill** 的结构。我将构建一个 **Skill**（`packages/skills/` 下的 `SKILL.md` + reference 文档，与 `setup`/`instrumentation` 同族），**不是** `traceability` CLI 子命令——因为"分析代码逻辑并在关键位置自动添加上报代码"是 agent 行为，CLI 命令做不到。如果你其实还想要一个 CLI 子命令，告诉我，我再补。

## 这个 skill 是什么（与现有 `instrumentation` 的区分）

- `instrumentation`：给**单个功能/函数**加埋点，用户已经知道调用点在哪。
- **`trace`（新）**：用户只给一个**用户链路名**（登录流程 / 下单流程 / 发消息…）。Agent **自动分析代码仓库画出整条链路** → **识别关键位置** → **自动添加上报代码**。用户全程不用手动读代码排查逻辑。

这正是你描述的流程："不用让用户自己去排查代码的逻辑，而是借助 AI 自动分析出代码逻辑，然后在关键位置自动添加上报代码"。

## 文件结构（对齐 `setup/`）

```
packages/skills/trace/
  SKILL.md                  # 工作流（精简，API 用法下放到 reference）
  references/
    reporting-api.md        # "如何使用上报方法"的文档（你要的那个 reference）
  README.md                 # 触发场景 / 文件清单（对齐 instrumentation/README.md）
```

## SKILL.md 工作流

Frontmatter：

- `name: traceability-trace`
- `description: Use when the user names a user flow / 链路 (登录流程, 下单流程, …) and wants it instrumented end-to-end without manually tracing the code. The agent analyzes the codebase to map the flow, finds the key positions, and auto-adds @traceability/core reporting calls.`

步骤（精简，API 细节指向 `references/reporting-api.md`）：

0. **确认链路与边界** — 复述用户给出的链路（入口触发 → 期望结果）。仅当入口或成功/退出条件不明确时才问用户。
1. **确认 SDK 已接入** — 检查 `init(...)` 是否已 wiring（否则交给 `setup` skill）。未接入则停下，先让用户跑 setup。
2. **分析代码仓库，画出链路** — 从入口出发，追踪 handler / 状态流转 / 网络调用 / 副作用 / 成功与错误出口，产出一份**有序的关键位置清单**（`file:fn`）。这是替换"用户手动读代码"的 AI 驱动步骤。
   - 关键位置类别：链路入口、每个主要步骤/状态流转、网络调用边界、分支点、错误路径、链路出口（成功）。
3. **为每个位置选 API**（见 `references/reporting-api.md`）：`setTag('flow', <name>)` 聚合整条链路；入口/各步用 `addBreadcrumb`；步骤成功用 `report({type:<flow>-<step>})`；错误用 `report({type:<flow>-<step>-failed})` + `captureException`；端到端耗时用 `reportPerformance`。
4. **埋点** — 在每个关键位置添加调用。普通模块直接用 `@traceability/core`；React 组件内用 `useMonitorReport()` / `MonitorErrorBoundary`。`type` 命名复用 `../instrumentation/references/event-types.md`（链接，不复制）。
5. **验证** — 手动触发一次链路，确认事件出现在 Inbox 或 `traceability issue list --appId <id>`，并检查事件能按 `flow` tag 聚合。
6. **提交** — `git commit -m "feat: instrument <flow> flow"`。

## references/reporting-api.md（SKILL.md 唯一依赖的 API 文档）

自包含的"如何使用上报方法"，按多步链路场景组织：

- **方法速查表**：`report` / `captureException` / `captureMessage` / `addBreadcrumb` / `setTag` / `setContext` / `setApp` / `reportPerformance` —— 每个一行签名 + "在链路的哪种位置用"。
- **链路埋点模式**：入口 breadcrumb → 每步 `report` → 错误 `report(...-failed)` + `captureException` → 出口 `report` + `reportPerformance`，全部用 `setTag('flow', …)` 串起来。
- **一个完整多步示例**（登录流程：表单提交 → 校验 → API 调用 → 存 token → 跳转，含错误分支）。
- **React 变体**：组件内用 `useMonitorReport()`。
- 链接到 `../instrumentation/references/event-types.md`（`type` 命名）与 `../instrumentation/assets/templates/report-event.ts`（单操作模板）。
- 注明 `init(...)` 必须已调用（指向 `setup` skill）。

## README.md

对齐 `instrumentation/README.md`：触发场景（中英短语）、文件清单、与 `instrumentation` 的区分说明。

## 命名

- 文件夹 `trace/`，`name: traceability-trace`（"trace" 直接对应"链路"）。
- 备选：若你觉得 `trace` 易与 stacktrace 混淆，可改 `flow/` + `traceability-flow`——在批准时告诉我即可。

## 不在范围内

- 不新增 CLI 子命令。
- 不构建（skills 作为文档被消费）。
- 不复制 `core-api.md` / `event-types.md`，改为链接到现有 `instrumentation` references，避免双份漂移。
- 不发布包。
