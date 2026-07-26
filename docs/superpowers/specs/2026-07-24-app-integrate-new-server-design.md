# App 接入新 server (Fastify + PG + tRPC)

- **状态**：Implemented
- **作者**：evan
- **日期**：2026-07-24
- **相关**：`docs/superpowers/specs/2026-07-23-sentry-compatible-ingestion-server.md`

## 1. 背景

> **Implementation note (2026-07-26):** The in-scope migration is implemented in the
> current worktree. The fix-loop APIs remain intentionally out of scope and their CLI
> commands return exit code `2`, as required below. Verification includes unit tests,
> a PostgreSQL-backed ingest integration test, CLI/server smoke calls, type-checking,
> linting, and a production renderer build with `VITE_MANAGEMENT_TOKEN`.

`server/` 已完成从 Express + SQLite 到 **Fastify + PostgreSQL** 的重写（commit `3403433`），API 命名和数据模型全部改换：

- `Application` (name / repoUrl / defaultBranch) → `Project` (slug / name / platform / sentryProjectId / …)
- REST 路径由 `/api/*` 迁到 `/api/v1/*`
- 所有管理接口强制 Bearer 认证（`MANAGEMENT_AUTH_TOKEN`，开发默认 `traceability-development-token`）
- `IssueStatus` 由 `open | fix-manual | fixing | fixed | ignored` 收敛到 `unresolved | resolved | ignored`
- 响应封装从 `{code:0, data, timestamp}` 改为 `{data}` / `{data, nextCursor}`；错误 `{code:string, message?}`
- **不再实现**：Performance / rrweb Replay / SourceMap upload / fix-request+attach-patch+mark-fixed / WebSocket
- **保留**：Sentry-兼容的 envelope 摄入端点 `POST /api/:projectId/envelope/`

`app/`（Electron + React）与 `packages/cli` 仍在打旧 API。本 spec 定义"让 app 与 CLI 与新 server 互通"的一次性改造，同时借这次改动把类型来源与传输层现代化：

- 引入 **tRPC v11** 作为管理面 API 传输层
- 删除 `@traceability/protocol` 与 `@traceability/client` 两个包
- 类型单一真值：server 的 zod schema + tRPC `AppRouter` 类型；Sentry 线协议类型改用官方 `@sentry/types`

## 2. 目标 & 范围

### 2.1 In scope

- **server**：新增 `server/src/trpc/`（context + procedures + routers），管理面（projects / issues / operations）迁到 tRPC；Sentry envelope 路由保持 raw Fastify；删除 `@fastify/swagger` + `swagger-ui` + 三个 `domains/*/routes.ts`
- **删除 `@traceability/protocol`** 整个包
- **删除 `@traceability/client`** 整个包
- **app renderer**：改用 `@trpc/react-query`；删除 `apis/`、`lib/request.ts`、`lib/ws.ts`；删除 Performance 页面与 Issue 详情 Replay tab；`Application` / `appId` 全量重命名为 `Project` / `projectId`；`CreateApp` 表单改为 `slug + name`；onboarding 同步。**`SourceLocation.tsx` 组件源码保留**（本次不在 Issue 详情页挂载，未来 source-map 解析补齐后无缝接回）
- **app main**：`@trpc/client`（无 React）；两个 builtin extensions（`apps` → `projects`、`issues`）改造为 tRPC 调用；Issue 状态收敛到 3 值
- **`packages/cli`**：改用 `@trpc/client`；命令 `app` → `project`；`issue fix-request | attach-patch | mark-fixed` 保留命令定义但执行时 `exit 2` 并输出 "not available on this server (v1)" 文案
- **认证注入**：静态 Bearer token
  - renderer 构建：`VITE_MANAGEMENT_TOKEN`（未配置时使用 dev fallback；生产 build 前置检查若未设则 fail）
  - main / CLI 运行时：`TRACEABILITY_MANAGEMENT_TOKEN`
  - server：`MANAGEMENT_AUTH_TOKEN`（已有）
- **实时刷新**：删除 renderer WS 代码；改用 react-query 的 `refetchOnWindowFocus` + 手动 refresh
- **文档**：更新 `CLAUDE.md` / `AGENTS.md` / `app/src/renderer/apis/README.md`（此 README 因目录删除一并移除）；`packages/cli/README.md` 追加迁移小节

### 2.2 Out of scope

- server 补齐 performance / rrweb replay / **source map 解析（含上传端点 + worker processor + resolved frames 存储）**/ fix loop / WebSocket 能力（后续独立 spec；source-map 单独一个 spec `2026-07-2X-source-map-resolution.md` 计划中）
- 保留 Swagger / OpenAPI 输出（本次直接放弃 `/api-docs`；未来若需外部 REST 再评估 `trpc-openapi`）
- `@traceability/core` SDK 重构（envelope 传输链路不变，只把内部类型改用 `@sentry/types`）
- 旧 SQLite → 新 Postgres 的数据迁移脚本
- 用户可配置的 token UI（保留静态注入）

### 2.3 成功标准

1. 本地 `pnpm --filter @traceability/server dev` + `pnpm dev:app` 可完成：创建 project → 切换 project → 查看 issue 列表 / 详情 / events → 修改 issue 状态（`unresolved | resolved | ignored`）
2. main 侧 agent 内建工具 `list_projects` / `list_issues` / `get_issue` 正常
3. CLI 可运行：`traceability project list | show | create | update | remove` 与 `traceability issue list | show`；`fix-request | attach-patch | mark-fixed` 以 exit 2 + 明确文案返回
4. `pnpm test`、`pnpm type-check`、`pnpm lint`、`pnpm build` 全部通过
5. 仓库中不再存在 `@traceability/protocol`、`@traceability/client` 两个包
6. `grep -R "@traceability/protocol\|@traceability/client" app packages server` 无命中
7. Renderer 生产 bundle 不含 `@trpc/server` 代码：`grep -R "@trpc/server" app/out/renderer` 无命中

## 3. 概念映射

| 旧（app / 旧 server） | 新（新 server / 本次接入后 app） |
|---|---|
| `Application { id, name, repoUrl, defaultBranch, createdAt }` | `Project { id, organizationId, sentryProjectId, slug, name, platform, enabled, createdAt, updatedAt }` |
| `appId` | `projectId` |
| REST `/api/apps` `/api/issues` `/api/performance` `/api/ws` | tRPC `/api/trpc/projects.*` `/api/trpc/issues.*` `/api/trpc/operations.*` |
| `IssueStatus = open | fix-manual | fixing | fixed | ignored` | `IssueStatus = unresolved | resolved | ignored` |
| Issue `count` | Issue `eventCount` |
| 响应 `{code:0, data, timestamp}` | tRPC `{result:{data}}`（对调用者透明，`useQuery().data` 即业务值） |
| WS `/api/ws` `issue:*` 事件 | 无；由 react-query focus refetch + 手动 refresh 替代 |
| `RrwebReplay*` / `PerformanceSummary` / `SourceMapUpload` / `Patch` | 不存在（UI 相应模块整块删除；SourceLocation 组件源码保留待后续 source-map spec 接回） |
| `Authorization: Bearer traceability`（旧 server 忽略） | `Authorization: Bearer <MANAGEMENT_AUTH_TOKEN>`（强制校验） |

## 4. 组件与文件结构

### 4.1 server：新增 tRPC 层

```
server/src/trpc/
├── context.ts           # createContext({ req, res }) → { db, config, log, services }
├── trpc.ts              # initTRPC.context<Context>().create() + managementProcedure（Bearer middleware）
├── routers/
│   ├── projects.ts
│   ├── issues.ts
│   └── operations.ts
├── app-router.ts        # mergeRouters → export const appRouter; export type AppRouter
└── index.ts             # registerTrpc(app: FastifyInstance)（挂载 fastifyTRPCPlugin，prefix "/api/trpc"）
```

Router 骨架（示意）：

```ts
// server/src/trpc/routers/projects.ts
export const projectsRouter = router({
  list:         managementProcedure.query(({ ctx }) => ctx.services.projects.listProjects()),
  get:          managementProcedure.input(z.string().uuid())
                  .query(({ ctx, input }) => ctx.services.projects.getProject(input)),
  create:       managementProcedure.input(CreateProjectSchema)
                  .mutation(({ ctx, input }) => ctx.services.projects.createProject(input)),
  update:       managementProcedure.input(z.object({ projectId: z.string().uuid(), patch: UpdateProjectSchema }))
                  .mutation(({ ctx, input }) => ctx.services.projects.updateProject(input.projectId, input.patch)),
  listKeys:     managementProcedure.input(z.string().uuid())
                  .query(({ ctx, input }) => ctx.services.projects.listKeys(input)),
  createKey:    managementProcedure.input(z.string().uuid())
                  .mutation(({ ctx, input }) => ctx.services.projects.createKey(input)),
  revokeKey:    managementProcedure.input(z.object({ projectId: z.string().uuid(), keyId: z.string().uuid() }))
                  .mutation(({ ctx, input }) => ctx.services.projects.revokeKey(input.projectId, input.keyId)),
  getPolicy:    managementProcedure.input(z.string().uuid())
                  .query(({ ctx, input }) => ctx.services.projects.getPolicy(input)),
  updatePolicy: managementProcedure.input(z.object({ projectId: z.string().uuid(), patch: UpdateProjectPolicySchema }))
                  .mutation(({ ctx, input }) => ctx.services.projects.updatePolicy(input.projectId, input.patch)),
});
```

- 认证 middleware：从 `req.headers.authorization` 取 Bearer；`timingSafeEqual` 比较 `ctx.config.managementAuthToken`；失败 `throw new TRPCError({ code: "UNAUTHORIZED" })`
- service 层（`domains/*/service.ts`）保持不变，router 只做 procedure 包装
- **删除**：`server/src/domains/{projects,issues,operations}/routes.ts` 三个文件；`app.ts` 中相应的 `register*Routes` 调用；`@fastify/swagger` + `@fastify/swagger-ui` 依赖与挂载
- **保留**：`registerIngestRoutes`（Sentry envelope）、`/health/live` `/health/ready` `/metrics`

`server/package.json` 增加 `exports` 字段暴露 AppRouter 类型：

```json
{
  "name": "@traceability/server",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    "./trpc": { "types": "./dist/trpc/app-router.d.ts" }
  },
  "files": ["dist"]
}
```

（只导出类型子路径，不导出 runtime；确保 renderer bundler 不会误把 server 打进产物。）

### 4.2 删除 `@traceability/protocol`

- 删除 `packages/protocol/` 整个目录
- 从 `pnpm-workspace.yaml` 移除
- 全仓 `import ... from "@traceability/protocol"` 逐一替换：
  - 管理面类型（`Application`, `Issue`, `Event`, `PerformanceSummary`, `RrwebReplay*`, `Patch`, …）→ 消费方改从 `AppRouter` 推导（`inferRouterInputs<AppRouter>` / `inferRouterOutputs<AppRouter>`），或者直接消费 tRPC hook 的返回类型
  - Sentry envelope 相关（`EnvelopeHeader`, `EnvelopeItem`, `ParsedEnvelope`, `EnvelopeItemType`, `SentryEventPayload`）→ 改用 `@sentry/types` 中的 `Envelope` / `EnvelopeItem` / `Event`；server envelope-parser 与 `@traceability/core` transport 就地各自定义所需的最小类型
- CI 增加 grep 校验（见 §7）

### 4.3 删除 `@traceability/client`

- 删除 `packages/client/` 整个目录
- 从 `pnpm-workspace.yaml` 移除
- 消费方：
  - `app/src/extensions/builtins/apps` → 改造为 `projects`，用 main 侧 tRPC client（§4.5）
  - `app/src/extensions/builtins/issues` → 改用 main 侧 tRPC client
  - `packages/cli` → 改用 tRPC client（§4.6）

### 4.4 app renderer

```
app/src/renderer/
├── lib/
│   ├── trpc.ts                 # 新增：createTRPCReact<AppRouter>() + createTrpcClient(baseUrl, token)
│   ├── request.ts              # 删除
│   ├── ws.ts                   # 删除
│   └── trpc-error-toaster.tsx  # 新增：订阅 QueryClient 错误事件 → sonner toast + 复制
├── apis/                       # 整个目录删除（README.md 一并删）
├── hooks/
│   ├── use-apps.ts             # 重命名 → use-projects.ts；调用 trpc.projects.list.useQuery()
│   ├── use-issues.ts           # 参数 { projectId, cursor?, limit? }；调用 trpc.issues.list.useQuery
│   ├── use-issue.ts            # 删除 useIssueReplays / useReplay；保留 useIssue / useIssueEvents
│   └── use-create-app.ts       # 重命名 → use-create-project.ts；trpc.projects.create.useMutation
├── context/
│   ├── current-app.tsx         # 重命名 → current-project.tsx；类型 Project；storage key 也一起改
│   └── ...
├── App.tsx                     # 挂 <trpc.Provider client queryClient>；删掉 connectWs() 调用
├── pages/
│   ├── performance/            # 整个目录删除；Sidebar 中的 "Performance" 项一并删
│   ├── issues/
│   │   ├── index.tsx           # 删除 onIssueEvent 订阅；字段 count → eventCount；appId → projectId
│   │   ├── detail.tsx          # 删除 replay tab；本次不挂载 SourceLocation 面板（组件源码保留）；status label/group 收敛
│   │   └── _components/
│   │       ├── RrwebReplayPlayer.tsx  # 删除
│   │       └── SourceLocation.tsx     # 保留源码，本次仅从 detail.tsx 中解引；待独立 source-map spec 完成后接回
│   ├── inbox/index.tsx         # 占位保留
│   └── _layout/_components/
│       ├── HeaderAppSwitcher.tsx      # 重命名 → HeaderProjectSwitcher；显示 slug 代替 repoUrl
│       ├── CreateAppModal.tsx         # 重命名 → CreateProjectModal；字段 slug + name
│       ├── AppOnboardingGuide.tsx     # 重命名 → ProjectOnboardingGuide；步骤 Welcome / Slug / Name / Review
│       └── Sidebar.tsx                # 移除 "/monitor/performance" 项
├── lib/utils.ts                # statusGroup / statusLabel / issueSource 收敛到 3 状态
└── vite-env.d.ts               # 新增 readonly VITE_MANAGEMENT_TOKEN?: string
```

`lib/trpc.ts` 骨架：

```ts
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import type { AppRouter } from "@traceability/server/trpc";

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient(baseUrl: string, token: string) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${baseUrl.replace(/\/$/, "")}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${token}` }),
      }),
    ],
  });
}

export function resolveRendererServerUrl(): string {
  const raw = import.meta.env?.VITE_SERVER_URL;
  return typeof raw === "string" && raw.trim() ? raw.replace(/\/$/, "") : "http://localhost:3000";
}

export function resolveRendererToken(): string {
  const raw = import.meta.env?.VITE_MANAGEMENT_TOKEN;
  return typeof raw === "string" && raw.trim() ? raw : "traceability-development-token";
}
```

QueryClient 全局配置：`refetchOnWindowFocus: true`、`staleTime: 15_000`、`retry: 1`。

### 4.5 app main（Electron 主进程）

```
app/src/main/
├── trpc-client.ts              # 新增：createMainTrpcClient() → @trpc/client + httpBatchLink
├── env.d.ts                    # 补 TRACEABILITY_SERVER_URL / TRACEABILITY_MANAGEMENT_TOKEN
└── ...
```

```
app/src/extensions/builtins/
├── projects/                   # 原 apps/，目录重命名
│   ├── common/
│   │   ├── extension.ts        # id: "projects"
│   │   └── types.ts            # PROJECTS_LIST_TOOL / PROJECTS_LIST_BLOCK_TYPE
│   ├── main/index.ts           # await trpc.projects.list.query(); block props { projects }
│   └── renderer/index.tsx      # ProjectsListBlock（原 AppsListBlock）
└── issues/
    ├── common/
    │   ├── extension.ts
    │   └── types.ts            # 状态字面量：unresolved | resolved | ignored（与 server 一致；UI 显示词由 statusLabel() 映射，如 unresolved → "Open"）
    ├── main/index.ts           # trpc.issues.list.query({ projectId, cursor, limit })
    └── renderer/index.tsx      # 列渲染字段 projectId / eventCount / lastSeen
```

`main/trpc-client.ts` 骨架：

```ts
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@traceability/server/trpc";

export function createMainTrpcClient() {
  const baseUrl = (process.env.TRACEABILITY_SERVER_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const token = process.env.TRACEABILITY_MANAGEMENT_TOKEN ?? "traceability-development-token";
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, headers: () => ({ authorization: `Bearer ${token}` }) })],
  });
}
```

### 4.6 packages/cli

```
packages/cli/src/
├── lib/
│   ├── config.ts               # server / token 键保留；apps → projects 键；一次性兼容读取旧键
│   └── trpc.ts                 # 新增：getTrpcClient()
└── commands/
    ├── project.ts              # 原 app.ts；子命令 list / show / create / update / remove
    ├── issue.ts                # list / show 迁移；fix-request/attach-patch/mark-fixed 保留占位（exit 2）
    └── config.ts               # 支持 project 键；--server / --token 参数一致
```

- CLI `project create` 输入变为 `--slug <s> --name <n>`（旧 `--repo-url / --default-branch` 移除）
- CLI 顶层保留 `app` 命令名一次，作为 deprecation alias：`traceability app <sub>` 打印 warning 并转发到 `project <sub>`（一次 minor 版本后移除）

## 5. 数据流

### 5.1 Renderer 请求路径

```
组件 useQuery/useMutation
   ↓
@trpc/react-query hook（trpc.issues.list.useQuery）
   ↓
httpBatchLink → POST ${SERVER_URL}/api/trpc/issues.list?batch=1
   headers: { authorization: "Bearer <VITE_MANAGEMENT_TOKEN>" }
   ↓
Fastify + fastifyTRPCPlugin
   ↓
managementProcedure middleware（Bearer 验证）
   ↓
router.issues.list → IssueService.listForProject
   ↓
Postgres (drizzle) → { data, nextCursor }
   ↓
tRPC response → renderer；@trpc/react-query 写入 QueryClient 缓存
```

- **Batch**：`httpBatchLink` 自动合并同 tick 请求
- **响应包装**：tRPC 内部把成功值放到 `{ result: { data } }`；`useQuery().data` 即业务值

### 5.2 Renderer 手动 refresh 替代 WS

- QueryClient 全局 `refetchOnWindowFocus: true`
- Header 中的 RefreshButton → `queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.issues.list) })`
- `staleTime: 15_000`；不设 `refetchInterval`

### 5.3 Main 调用路径

Agent tool（`list_projects` / `list_issues` / `get_issue`）→ `mainTrpc.projects.list.query()` → 同 renderer 路径。

### 5.4 CLI 调用路径

argv → commander → handler → `cliTrpc.<ns>.<op>.{query,mutate}()` → server。baseUrl / token 从 `traceability config` / env / `--server` / `--token` 分级读取。

## 6. 错误处理

### 6.1 tRPC error 语义映射

| 场景 | tRPC code | HTTP | 客户端处理 |
|---|---|---|---|
| Bearer 缺失 / 错 | `UNAUTHORIZED` | 401 | renderer toast "认证失败，请检查 VITE_MANAGEMENT_TOKEN"；CLI print + exit 2 |
| zod 输入校验失败 | `BAD_REQUEST` | 400 | toast 具体字段（`error.data.zodError` 存在时展开） |
| service 未找到 | `NOT_FOUND` | 404 | 展示空态 |
| service 其他业务错误 | `BAD_REQUEST` | 400 | toast |
| 未知错误 | `INTERNAL_SERVER_ERROR` | 500 | server pino log；client toast "服务出错" + traceId |
| Ingest 端点错误 | 非 tRPC | 400/413/429 | 保持原有 `IngestRequestError` 处理，不受本次影响 |

### 6.2 Renderer 统一错误 UI

`<TrpcErrorToaster>` 组件挂在 `<QueryClientProvider>` 内：

```ts
useEffect(() => {
  const unsub = queryClient.getQueryCache().subscribe((evt) => {
    if (evt?.type !== "updated" || evt.action?.type !== "error") return;
    const err = evt.query.state.error as TRPCClientErrorLike<AppRouter> | undefined;
    if (!err) return;
    toast.error(err.message, { action: { label: "复制", onClick: () => copyTextToClipboard(err.message) } });
  });
  return unsub;
}, [queryClient]);
```

## 7. 认证 & 环境注入

| 位置 | 变量 | 时机 | 用途 |
|---|---|---|---|
| renderer 构建 | `VITE_SERVER_URL` | 构建（保持） | tRPC baseUrl；default `http://localhost:3000` |
| renderer 构建 | `VITE_MANAGEMENT_TOKEN` | 构建 | Bearer；未配置时用 `traceability-development-token` |
| main 运行 | `TRACEABILITY_SERVER_URL` / `TRACEABILITY_MANAGEMENT_TOKEN` | 运行 | 同上 |
| CLI 运行 | `TRACEABILITY_SERVER_URL` / `TRACEABILITY_MANAGEMENT_TOKEN` 或 `traceability config` | 运行 | 分级读取：`--flag > env > config > dev fallback` |
| server 运行 | `MANAGEMENT_AUTH_TOKEN` | 运行（已有） | 认证真值 |

**生产 build 保护**：electron-vite renderer config 前置检查（此检查在 vite config 加载时的 Node 上下文执行，读取的是构建环境的 `process.env`，而不是 renderer 运行时）：

```ts
if (process.env.NODE_ENV === "production" && !process.env.VITE_MANAGEMENT_TOKEN) {
  throw new Error("VITE_MANAGEMENT_TOKEN must be set for production builds");
}
```

## 8. 类型来源（单一真值）

- **管理面 API 类型**：来自 server tRPC `AppRouter`
  ```ts
  import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
  import type { AppRouter } from "@traceability/server/trpc";
  type RouterOutputs = inferRouterOutputs<AppRouter>;
  type Project = RouterOutputs["projects"]["list"][number];
  type Issue   = RouterOutputs["issues"]["list"]["data"][number];
  ```
- **Sentry envelope 线协议**：使用 `@sentry/types` 中的 `Envelope` / `EnvelopeItem` / `Event`
- **Renderer 组件 props**：直接从 tRPC hook 的返回类型推导，不再手写 DTO

## 9. build & dev 联动

app / CLI 需要拿到 server 的 `AppRouter` 类型：

- `app/package.json` 与 `packages/cli/package.json` 添加 `"@traceability/server": "workspace:*"`（仅 `import type` 使用）
- `turbo.json` 中 `app#build`、`cli#build`、`app#typecheck`、`cli#typecheck` 追加 `"dependsOn": ["@traceability/server#build"]`
- server dev：`tsx watch` + 并发一个 `tsc --emitDeclarationOnly --watch --project tsconfig.build.json`（生成 `.d.ts` 到 `dist/`）；或用 project references + `tsc -b --watch`——**具体命令在 plan TODO 中敲定**
- renderer bundler 只 `import type`，tree-shake 后不含 server 代码；grep 校验（§10）兜底

## 10. 测试策略

### 10.1 server

- 保留现有 `server/src/__tests__/*.test.ts` service 单测
- 新增 `server/src/trpc/__tests__/router.test.ts`：
  - `createCallerFactory(appRouter)` 直接调用（绕过 HTTP）验证 `projects.create` / `issues.list` 分页 / `updateIssue` 状态切换
  - `app.inject({ method: "POST", url: "/api/trpc/projects.list", … })` 验证 Bearer middleware 与 HTTP 层集成
  - 未认证请求 → 401

### 10.2 app

- 删除 `app/src/renderer/apis/monitor.test.ts`（目录随之删除）
- 新增 `app/src/renderer/lib/trpc.test.tsx`：mock link 验证 401 toast、批处理、分页缓存 key
- `app/src/renderer/hooks/use-issues.test.ts`：`msw` 拦截 `/api/trpc/issues.list?batch=1`
- extensions：`app/src/extensions/builtins/projects/main/__tests__` + `issues/main/__tests__` 各加一个 integration test，注入 mock tRPC client 断言 tool 返回结构

### 10.3 CLI

- `packages/cli/src/commands/__tests__/project.test.ts`：`msw` mock server 验证 list / show / create
- `issue-fix-loop.test.ts`：`fix-request | attach-patch | mark-fixed` 返回 exit 2 + stderr 文案

### 10.4 CI 校验

- `grep -R "@traceability/protocol\|@traceability/client" app packages server` 无命中
- `grep -R "@trpc/server" app/out/renderer` 无命中（生产 bundle 校验）
- 现有 `pnpm test | type-check | lint | build` 保持

## 11. 迁移依赖顺序（供 writing-plans 参考）

```
① server：新增 tRPC 层（context/trpc/routers），保留旧 REST 并存一次以验证 → app router 类型导出
② server：删除旧 REST 路由 + Swagger 依赖
③ app/CLI 添加 workspace 依赖 "@traceability/server"（仅类型）；turbo pipeline 加 build 依赖
④ app renderer：迁 context / hooks / apis 删除 / pages（Application → Project 一次性重命名）
⑤ app main + extensions（apps → projects；issues 状态收敛）
⑥ CLI：project.ts + issue.ts 改造；配置键与文档同步
⑦ 删除 packages/protocol、packages/client；清 pnpm-workspace.yaml；grep 校验
⑧ 文档更新（CLAUDE.md / AGENTS.md / CLI README / 删除 apis/README.md）
⑨ CI 追加两条 grep gate
```

## 12. 风险 & 回退

| 风险 | 影响 | 缓解 |
|---|---|---|
| server `.d.ts` 未生成导致 app 类型爆炸 | dev 阻断 | 明确 turbo dep + dev 并发 tsc emitDeclarationOnly；plan 中给出精确命令 |
| renderer 意外把 `@trpc/server` 打进 bundle | 产物膨胀 / 安全暴露 | 严格 `import type`；CI grep gate |
| 生产 build 遗忘 `VITE_MANAGEMENT_TOKEN` | 线上 401 全线爆 | electron-vite plugin 前置校验（§7） |
| CLI 破坏性重命名（app→project）冲击既有脚本 | 用户脚本失效 | 保留 `app` deprecation alias 一次 minor 版本；README 迁移小节 |
| Renderer 失去 WS 后错觉"数据不刷新" | 用户体验回退 | focus refetch + 手动 refresh 按钮；文档说明 |
| tRPC v11 与现有依赖版本冲突 | 安装失败 | 提前跑 `pnpm install`；`pnpm-workspace.yaml` catalog 里锁 tRPC 版本；tRPC v11 与 `@tanstack/react-query` v5 兼容（app 已在用 v5），无需同步升级 |

回退策略：若上线阻断，可 revert 迁移合并 commit；旧 `@traceability/protocol` `@traceability/client` 尚在 git 历史，恢复即可。
