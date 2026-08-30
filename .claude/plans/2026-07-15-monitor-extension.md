# Monitor Extension 实现规划（apps + issues 双 extension）

**日期**：2026-07-15
**状态**：已实现，待冒烟
**目标**：新增两个 builtin extension `apps` 与 `issues`，让 read-only agent 通过 `@traceability/client` 查询 server。apps extension：list tool + 纯展示 block；issues extension：list/get 两个 tool + 可点击导航 block。每个 extension 在各自 main 顶部创建 transient client 实例（临时方案，非共享模块）。

---

## 1. 任务做什么

### 1.1 背景

Traceability 的 agent（read-only）目前不能查看 server 上的 issues/apps。本规划让 agent 调用 tools 查询 server，结果以可交互 assistant block 呈现在消息流。这是 agent 面板与 monitor 主区域的**反向打通**：已有 `IssueDetailPage -> promptAgent({context:{appId,source:"issue",issueId}})` 是 issue->agent；本规划补 agent->issue（点击 block 导航 `/issues/:id`）。

### 1.2 决策（已与用户确认）

- **D1 current app**：agent 负责 appId（**不改** main 端 `ExtensionToolRuntimeContext` / `agent-runtime` / `core/main` 接口）。`issues/list` 的 `appId` 可选；未提供时 tool 内部 `askUserQuestion` 弹 app 选择器兜底。
- **D2 server URL**：main 端读 `process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000"`，token 用 dummy `"traceability"`（server 无 auth，client 有 `!token` 前置 guard 故须传非空）。
- **D3 app block**：纯展示（id/name/repoUrl/defaultBranch/createdAt），不可点击。
- **D4 issue block**：点击 `useNavigate()` 跳转 `/issues/:id`。
- **D5 拆分**：apps 与 issues 是两个独立 extension（各含 common/main/renderer）。**client 不共享**--每个 extension 的 main 顶部各自 `createTraceabilityClient(...)`（transient，临时方案）。tool 命名 `apps/list`、`issues/list`、`issues/get`；block 命名 `apps.list`、`issues.list`。
- **D6 get_issue**：返回 text（issue 详情摘要），不返回 block（MVP；详情页已有完整 UI）。但 `AgentToolResult.details` 是**必填**字段，故返回 `details: { type: "monitor.issue.detail" }`（无 `assistantBlock`，renderer `getAssistantBlockDescriptor` 检测无 `assistantBlock` 返回 null，不渲染 card）。
- **D7 不改**：`core/main` 接口、`agent-runtime`、assistant block 渲染链路（TODO E 已就绪）、路由、`current-app` context、store。

---

## 2. 变更范围

### 2.1 In scope

- 新建 `app/src/extensions/builtins/apps/{common,main,renderer}/`（main 顶部 inline 创建 client）
- 新建 `app/src/extensions/builtins/issues/{common,main,renderer}/`（main 顶部 inline 创建 client）
- 注册：`app/src/main/extensions/installed-extensions.ts`（+apps +issues main）+ `app/src/extensions/builtins/index.renderer.tsx`（+apps +issues renderer）
- tsconfig side-split：`app/tsconfig.json`（exclude 两个 main）+ `app/tsconfig.node.json`（include 两个 common/main）
- `app/package.json` 加 `@traceability/client: workspace:*`

### 2.2 Out of scope

- 不改 `core/main` 接口、`agent-runtime`、渲染链路、路由、store
- 不做 slash command（agent 自动调 tool 即可）
- `issues/get` 不返回 block（text only）
- 不取 events/replays（详情页自己用 `useIssueEvents` 加载）
- 不做分页 UI（`nextCursor` 透传到 block props，MVP 不渲染"加载更多"）

---

## 3. 现状基线（已核实）

| 项                                                                                                                                   | 状态                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extension 框架 + `subagents` 三层模板                                                                                                | **就绪**（`app/src/extensions/builtins/subagents/`）                                                                                                                                                                     |
| Assistant block 渲染链路：`tool_execution_*` -> `toolStates` -> `assistant-tool-message.tsx` -> `useAssistantBlock(type)`            | **就绪**（TODO E 已落地）                                                                                                                                                                                                |
| `@traceability/client` API                                                                                                           | `createTraceabilityClient({baseUrl, token})`；`apps.list():Application[]`、`apps.get(id)`、`issues.list({appId?,status?,limit?,cursor?}):{items,nextCursor}`、`issues.get(id):Issue`                                     |
| server auth                                                                                                                          | **无 auth，忽略 token**；client 有 `!token` 前置 guard，须传非空 token（dummy 可行）                                                                                                                                     |
| 路由 `/issues/:id`（`createMemoryRouter`）+ `AgentPanel` 在 router 内（`Layout` 是根 element，`AgentPanel` 与 `<Outlet/>` 并列）     | **就绪**（block 组件可用 `useNavigate`）                                                                                                                                                                                 |
| `Application = {id,name,repoUrl,defaultBranch,createdAt}`（仅 5 字段）                                                               | 已确认                                                                                                                                                                                                                   |
| `Issue = {id,appId,fingerprint,title,type,firstSeen,lastSeen,count,status,metadata:{stacktrace?,message?,context?,source?,frames?}}` | 已确认                                                                                                                                                                                                                   |
| `ctx.extensionRuntime.askUserQuestion(input)`                                                                                        | **就绪**；`AskUserQuestionInput = {questions:[{header,question,options:[{label,description}],multiSelect?}]}`，返回 `{answers:[{question,selectedOptions:string[],customAnswer?}]}`（`selectedOptions` 是 label 字符串） |
| **tsconfig side-split 是逐个显式列出 extension 目录**（非通配）                                                                      | `tsconfig.node.json` include 列了 `builtins/subagents/{common,main}/**`；`tsconfig.json` exclude 列了 `builtins/subagents/main/**`。新增 extension **必须**手动加 tsconfig 条目                                          |
| `app` 依赖 `@traceability/client`                                                                                                    | **缺失**（已有 `@traceability/protocol` + `axios`，需加 client）                                                                                                                                                         |
| client `dist/index.js`（ESM，`exports.import` 指向 dist）                                                                            | 需 `pnpm --filter @traceability/client build`                                                                                                                                                                            |
| `electron-vite` main 段 `externalizeDeps: true`                                                                                      | 会 externalize `@traceability/client` + `axios`，运行时从 node_modules 解析                                                                                                                                              |

---

## 4. 数据契约

### 4.1 `apps/common/types.ts`

```ts
import type { Application } from "@traceability/protocol";
export const APPS_LIST_TOOL = "apps/list";
export const APPS_LIST_BLOCK_TYPE = "apps.list";
export interface AppsListBlockProps {
  apps: Application[];
}
```

### 4.2 `issues/common/types.ts`

```ts
import type { Issue } from "@traceability/protocol";
export const ISSUES_LIST_TOOL = "issues/list";
export const ISSUES_GET_TOOL = "issues/get";
export const ISSUES_LIST_BLOCK_TYPE = "issues.list";
export interface IssuesListBlockProps {
  issues: Issue[];
  appId: string;
  nextCursor: string | null;
}
```

### 4.3 Tool 返回的 `details`

- `apps/list`: `details = { type: "monitor.apps.runtime", assistantBlock: { type: APPS_LIST_BLOCK_TYPE, props: { apps } } }`
- `issues/list`: `details = { type: "monitor.issues.runtime", assistantBlock: { type: ISSUES_LIST_BLOCK_TYPE, props: { issues, appId, nextCursor } } }`
- `issues/get`: **无 details**（`{ content: [{type:"text", text}] }` only）

---

## 5. 变更详情

### 5.1 Client 构造（每个 extension main 顶部 inline，transient 临时方案）

```ts
import { createTraceabilityClient } from "@traceability/client";

const client = createTraceabilityClient({
  baseUrl: process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000",
  token: "traceability",
});
```

> apps/main 与 issues/main 各自创建一份（不共享模块）。server 无 auth，token 仅满足 client 的 `!token` 前置 guard。`process.env` 是 main-only，故只在 main 侧。

### 5.2 `apps/common/extension.ts`

```ts
export const APPS_EXTENSION = { id: "apps", name: "Apps" } as const;
```

### 5.3 `apps/main/index.ts`

```ts
import { Type } from "@earendil-works/pi-ai";
import { createTraceabilityClient } from "@traceability/client";
import type { Application } from "@traceability/protocol";
import { defineMainExtension } from "../../../core/main/index.js";
import { APPS_EXTENSION } from "../common/extension.js";
import { APPS_LIST_BLOCK_TYPE, APPS_LIST_TOOL } from "../common/types.js";

const client = createTraceabilityClient({
  baseUrl: process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000",
  token: "traceability",
});

export default defineMainExtension({
  ...APPS_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({
      id: "apps.prompt",
      content: `Use ${APPS_LIST_TOOL} to list the user's Traceability apps when they ask about their apps.`,
    });
    ctx.tools.register({
      name: APPS_LIST_TOOL,
      label: "List Apps",
      description: "List all Traceability apps.",
      executionMode: "sequential",
      parameters: Type.Object({}),
      async execute() {
        const apps = await client.apps.list();
        return {
          content: [{ type: "text", text: summarizeApps(apps) }],
          details: {
            type: "monitor.apps.runtime",
            assistantBlock: { type: APPS_LIST_BLOCK_TYPE, props: { apps } },
          },
        };
      },
    });
  },
});
// summarizeApps: 纯文本 name(id) 列表
```

### 5.4 `apps/renderer/index.tsx`

```tsx
import { defineRendererExtension } from "../../../core/renderer";
import { APPS_EXTENSION } from "../common/extension";
import { APPS_LIST_BLOCK_TYPE, type AppsListBlockProps } from "../common/types";

function AppsListBlock({ props }: { props: Record<string, unknown> }) {
  const block = parseAppsProps(props);
  if (!block) return null;
  return (
    <div className="not-prose my-2 border-y border-hairline text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-1 text-[10px] text-muted">
        <span className="font-[620]">Apps</span>
        <span className="text-tertiary">{block.apps.length}</span>
      </div>
      <div className="border-t border-hairline py-1">
        {block.apps.map((app) => (
          <div key={app.id} className="flex w-full items-center gap-2 px-1.5 py-1.5 text-left">
            {/* 纯展示: name + id + repoUrl + defaultBranch + createdAt(relativeTime) */}
          </div>
        ))}
      </div>
    </div>
  );
}

export default defineRendererExtension({
  ...APPS_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register({ type: APPS_LIST_BLOCK_TYPE, render: AppsListBlock });
  },
});
// parseAppsProps + isRecord: 防御性解析（参考 subagents parseListBlockProps）
```

### 5.5 `issues/common/extension.ts`

```ts
export const ISSUES_EXTENSION = { id: "issues", name: "Issues" } as const;
```

### 5.6 `issues/main/index.ts`

```ts
import { Type } from "@earendil-works/pi-ai";
import { createTraceabilityClient } from "@traceability/client";
import type { Issue, IssueStatus } from "@traceability/protocol";
import { defineMainExtension } from "../../../core/main/index.js";
import type { MainExtensionContext } from "../../../core/main/index.js";
import { ISSUES_EXTENSION } from "../common/extension.js";
import { ISSUES_GET_TOOL, ISSUES_LIST_BLOCK_TYPE, ISSUES_LIST_TOOL } from "../common/types.js";

const client = createTraceabilityClient({
  baseUrl: process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000",
  token: "traceability",
});

export default defineMainExtension({
  ...ISSUES_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({
      id: "issues.prompt",
      content: `Use ${ISSUES_LIST_TOOL} to list issues for an app and ${ISSUES_GET_TOOL} to get a single issue's detail. Pass appId when known; if unknown, omit it and the user will pick. Present results concisely; the UI renders interactive cards for issue lists.`,
    });

    ctx.tools.register({
      name: ISSUES_LIST_TOOL,
      label: "List Issues",
      description:
        "List issues for a Traceability app. appId is optional; if omitted, the user picks an app.",
      executionMode: "sequential",
      parameters: Type.Object({
        appId: Type.Optional(Type.String({ description: "App ID. Omit to let the user pick." })),
        status: Type.Optional(
          Type.String({ description: "Filter: open | fix-manual | fixing | fixed" }),
        ),
        limit: Type.Optional(Type.Number({ description: "Max issues to return (default 20)." })),
      }),
      async execute(_toolCallId, args) {
        let appId = typeof args.appId === "string" && args.appId ? args.appId : undefined;
        if (!appId) appId = await resolveAppId(ctx);
        const status = typeof args.status === "string" ? (args.status as IssueStatus) : undefined;
        const res = await client.issues.list({
          appId,
          ...(status ? { status } : {}),
          limit: args.limit ?? 20,
        });
        return {
          content: [{ type: "text", text: summarizeIssues(res.items) }],
          details: {
            type: "monitor.issues.runtime",
            assistantBlock: {
              type: ISSUES_LIST_BLOCK_TYPE,
              props: { issues: res.items, appId, nextCursor: res.nextCursor },
            },
          },
        };
      },
    });

    ctx.tools.register({
      name: ISSUES_GET_TOOL,
      label: "Get Issue Detail",
      description: "Get a single issue's full detail by ID.",
      executionMode: "sequential",
      parameters: Type.Object({ issueId: Type.String({ description: "Issue ID." }) }),
      async execute(_toolCallId, args) {
        const issue = await client.issues.get(args.issueId);
        // No assistantBlock -> renderer renders no card; issue detail is text only.
        return {
          content: [{ type: "text", text: summarizeIssue(issue) }],
          details: { type: "monitor.issue.detail" },
        };
      },
    });
  },
});

async function resolveAppId(ctx: MainExtensionContext): Promise<string> {
  const apps = await client.apps.list();
  if (apps.length === 0) throw new Error("No Traceability apps found.");
  if (apps.length === 1) return apps[0]!.id;
  const result = await ctx.extensionRuntime.askUserQuestion({
    questions: [
      {
        header: "Select app",
        question: "Which app's issues do you want to view?",
        options: apps.map((a) => ({ label: a.name, description: a.id })),
      },
    ],
  });
  const selected = result.answers[0]?.selectedOptions[0];
  const app = apps.find((a) => a.name === selected);
  if (!app) throw new Error("No app selected.");
  return app.id;
}
// summarizeIssues / summarizeIssue: 纯文本摘要
```

### 5.7 `issues/renderer/index.tsx`

```tsx
import { defineRendererExtension } from "../../../core/renderer";
import { useNavigate } from "react-router-dom";
import { ISSUES_EXTENSION } from "../common/extension";
import { ISSUES_LIST_BLOCK_TYPE, type IssuesListBlockProps } from "../common/types";

function IssuesListBlock({ props }: { props: Record<string, unknown> }) {
  const navigate = useNavigate();
  const block = parseIssuesProps(props);
  if (!block) return null;
  return (
    <div className="not-prose my-2 border-y border-hairline text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-1 text-[10px] text-muted">
        <span className="font-[620]">Issues</span>
        <span className="text-tertiary">{block.issues.length}</span>
      </div>
      <div className="border-t border-hairline py-1">
        {block.issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => navigate(`/issues/${issue.id}`)}
            className="flex w-full items-center gap-2 rounded-[7px] px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
          >
            {/* status dot (error=danger / other=warning) + title + count + relativeTime(lastSeen) + status label */}
          </button>
        ))}
      </div>
    </div>
  );
}

export default defineRendererExtension({
  ...ISSUES_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register({ type: ISSUES_LIST_BLOCK_TYPE, render: IssuesListBlock });
  },
});
// parseIssuesProps + isRecord: 防御性解析
```

### 5.8 注册

`app/src/main/extensions/installed-extensions.ts`:

```ts
import appsExtension from "../../extensions/builtins/apps/main/index.js";
import issuesExtension from "../../extensions/builtins/issues/main/index.js";
export const installedMainExtensions = [
  subagentsExtension,
  appsExtension,
  issuesExtension,
] satisfies AnyMainExtensionDefinition[];
```

`app/src/extensions/builtins/index.renderer.tsx`:

```tsx
import appsExtension from "./apps/renderer";
import issuesExtension from "./issues/renderer";
export const installedRendererExtensions = [
  subagentsExtension,
  appsExtension,
  issuesExtension,
] satisfies RendererExtensionDefinition[];
```

### 5.9 tsconfig side-split

`app/tsconfig.json`（renderer base，exclude 增 main-side）：

```diff
   "exclude": [
     "src/main/**",
     "src/preload/index.ts",
     "src/extensions/core/main/**",
-    "src/extensions/builtins/subagents/main/**"
+    "src/extensions/builtins/subagents/main/**",
+    "src/extensions/builtins/apps/main/**",
+    "src/extensions/builtins/issues/main/**"
   ]
```

`app/tsconfig.node.json`（main，include 增 common/main）：

```diff
   "include": [
     "electron.vite.config.ts",
     "src/main/**/*.ts",
     "src/preload/**/*.ts",
     "src/shared/**/*.ts",
     "src/extensions/core/common/**/*.ts",
     "src/extensions/core/main/**/*.ts",
     "src/extensions/builtins/subagents/common/**/*.ts",
-    "src/extensions/builtins/subagents/main/**/*.ts"
+    "src/extensions/builtins/subagents/main/**/*.ts",
+    "src/extensions/builtins/apps/common/**/*.ts",
+    "src/extensions/builtins/apps/main/**/*.ts",
+    "src/extensions/builtins/issues/common/**/*.ts",
+    "src/extensions/builtins/issues/main/**/*.ts"
   ]
```

### 5.10 依赖

- `app/package.json` deps 加 `"@traceability/client": "workspace:*"`
- `pnpm install`（app 的 `postinstall` = `electron-builder install-app-deps` 可能因 better-sqlite3 native 编译失败，这是 pre-existing，不影响 client workspace link）
- `pnpm --filter @traceability/client build`（生成 `dist/index.js`，main 运行时需要；types 走 `src/index.ts`）

---

## 6. 变更后文件结构

```
app/src/extensions/builtins/
├── apps/
│   ├── common/
│   │   ├── extension.ts                  # 新建: APPS_EXTENSION
│   │   └── types.ts                      # 新建: APPS_LIST_TOOL / APPS_LIST_BLOCK_TYPE / AppsListBlockProps
│   ├── main/
│   │   └── index.ts                      # 新建: transient client + list_apps tool + system prompt + summarizeApps
│   └── renderer/
│       └── index.tsx                     # 新建: apps.list block（纯展示）+ parseAppsProps
├── issues/
│   ├── common/
│   │   ├── extension.ts                  # 新建: ISSUES_EXTENSION
│   │   └── types.ts                      # 新建: ISSUES_LIST_TOOL / ISSUES_GET_TOOL / ISSUES_LIST_BLOCK_TYPE / IssuesListBlockProps
│   ├── main/
│   │   └── index.ts                      # 新建: transient client + list_issues + get_issue tools + system prompt + resolveAppId + summarize helpers
│   └── renderer/
│       └── index.tsx                     # 新建: issues.list block（点击导航）+ parseIssuesProps
├── index.renderer.tsx                    # 改:+appsExtension +issuesExtension
└── (subagents/ 不变)
app/src/main/extensions/installed-extensions.ts   # 改:+appsExtension +issuesExtension
app/tsconfig.json                                 # 改:exclude +apps/main +issues/main
app/tsconfig.node.json                            # 改:include +apps/{common,main} +issues/{common,main}
app/package.json                                  # 改:+@traceability/client
```

---

## 7. 实现步骤

1. 加依赖：`app/package.json` 加 `@traceability/client`，`pnpm install`，`pnpm --filter @traceability/client build`
2. 新建 `apps/`（common/extension.ts + common/types.ts + main/index.ts + renderer/index.tsx；main 顶部 inline client）
3. 新建 `issues/`（common/extension.ts + common/types.ts + main/index.ts + renderer/index.tsx；main 顶部 inline client）
4. 注册（§5.8 两个文件）
5. 改 tsconfig side-split（§5.9）
6. `pnpm --filter @traceability/app typecheck`（web + node clean，注意 `skill-service.ts` 的 8 个 pre-existing 错误是唯一允许例外）
7. `pnpm dev:app` 冒烟（需 server 跑在 localhost:3000 或 `TRACEABILITY_SERVER_URL` 指向它）：
   - "列出所有 app" -> apps block 渲染（纯展示）
   - "看 issues"（不知 appId 时）-> askUserQuestion 弹选择器 -> issues block 渲染
   - "看 <appId> 的 issues" -> issues block 直接渲染
   - 点击 issues block 某项 -> main 区导航到 `/issues/:id`
   - "看 issue <id> 的详情" -> text 摘要
8. commit: `feat(app): add apps + issues monitor extensions with clickable issue block`

---

## 8. 关键约束/决策

- **D1** agent 负责 appId，不改 main context/接口；`issues/list` appId 可选，无值 `resolveAppId` 兜底（0 个抛错 / 1 个自动用 / >1 弹 askUserQuestion 选择器，label=app.name、description=app.id，`selectedOptions[0]` 用 `apps.find(a => a.name === selected)` 匹配回 appId）
- **D2** `process.env.TRACEABILITY_SERVER_URL ?? localhost:3000` + dummy token，每个 extension main 顶部各自 inline `createTraceabilityClient`（transient，临时方案，非共享模块）
- **D3** apps block 纯展示，不可点击
- **D4** issues block 点击 `useNavigate()` -> `/issues/:id`
- **D5** apps 与 issues 是两个独立 extension；client 不共享，各自 main 顶部 inline 创建
- **D6** `issues/get` text only，无 `assistantBlock`；但 `AgentToolResult.details` 必填，故返回 `details: { type: "monitor.issue.detail" }`（renderer 检测无 `assistantBlock` 不渲染 card）
- **D7** 不改 core/agent-runtime/渲染链路/路由/store
- **D8 ESM**：main 端相对 import 用 `.js` 后缀；包 import（`@traceability/client`、`@traceability/protocol`、`@earendil-works/pi-ai`）不用；renderer 端 import 不用 `.js` 后缀
- **D9 client 须先 build**（`dist/index.js`）；`externalizeDeps` 会 externalize 它
- **D10 `executionMode: "sequential"`**（与 subagents 一致）
- **D11 `useNavigate`** 可用（AgentPanel 在 router 内，已核实 `Layout` 是 router 根 element）
- **D12 tsconfig 必改**：side-split 是逐个显式列出 extension 目录，新增 apps/issues 必须手动加 include/exclude（§5.9）。renderer 不编译 main-side（`process.env` 是 main-only，client 构造只在 main 侧）
- **D13 防御性解析**：renderer 的 `parseAppsProps`/`parseIssuesProps` 用 `isRecord` 守卫，无效 props 返回 null（参考 subagents `parseListBlockProps`）
- **D14 tool 命名**：`apps/list`、`issues/list`、`issues/get`；block 命名 `apps.list`、`issues.list`（点号风格与 `subagents.list` 一致）

---

## 9. 参考

- subagents extension（模板）：`app/src/extensions/builtins/subagents/{common,main,renderer}/`
- assistant block 渲染契约：`docs/superpowers/specs/2026-07-14-assistant-blocks-rendering.md`
- client API：`packages/client/src/index.ts`；CLI 用法：`packages/cli/src/lib/client.ts` + `packages/cli/src/commands/{app,issue}.ts`
- 路由：`app/src/renderer/router.tsx`；current-app：`app/src/renderer/context/current-app.tsx`；Layout：`app/src/renderer/pages/_layout/index.tsx`
- askUserQuestion shape：`app/src/extensions/core/common/human-in-the-loop.ts`
- tool 定义形状：`app/src/extensions/core/main/define.ts`；block 注册形状：`app/src/extensions/core/renderer/define.tsx`
- tsconfig 现状：`app/tsconfig.json` + `app/tsconfig.node.json`（subagents 的 side-split 条目作为新增模板）

---

## 10. 验收标准

1. apps/main 与 issues/main 各自顶部 inline `createTraceabilityClient`（transient，不共享模块）
2. `apps/` 与 `issues/` 各含 common/main/renderer 三层；常量与 props 接口定义齐全（§4）
3. `app` 依赖 `@traceability/client`，client 已 build
4. 3 tools 注册到 main extension：`apps/list`、`issues/list`（appId 可选 + `resolveAppId` 兜底）、`issues/get`（`details` 无 `assistantBlock`）
5. 2 blocks 注册到 renderer extension：`apps.list`（纯展示）、`issues.list`（点击 `navigate(/issues/:id)`）
6. `installed-extensions.ts` + `builtins/index.renderer.tsx` 各加两个 extension
7. `tsconfig.json` exclude + `tsconfig.node.json` include 含 apps/issues 条目（无 `_monitor`）
8. `pnpm --filter @traceability/app typecheck`（web + node）clean（skill-service.ts / session-persistence.test.ts pre-existing 错误除外）
9. `pnpm dev:app` 冒烟：apps block / issues block（含 askUserQuestion 兜底）/ 点击导航 / get_issue text 均通过
10. 单个 Conventional Commit：`feat(app): add apps + issues monitor extensions with clickable issue block`
