# App 接入新 server (tRPC) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Electron app 与 CLI 通过 tRPC v11 接入新的 Fastify + PostgreSQL server，删除 `@traceability/protocol` 和 `@traceability/client` 两个包，并把 Application → Project 全量重命名、IssueStatus 收敛到 `unresolved | resolved | ignored`。

**Architecture:** server 新增 `server/src/trpc/`（context + procedure + routers），管理面（projects/issues/operations）迁到 tRPC，Sentry envelope 端点保持 raw Fastify；app renderer 用 `@trpc/react-query`，app main 与 CLI 用 `@trpc/client`；类型单一真值来自 server `AppRouter`，Sentry 线协议类型用 `@sentry/types`。鉴权使用静态 Bearer token（renderer 构建期 `VITE_MANAGEMENT_TOKEN`、main/CLI 运行期 `TRACEABILITY_MANAGEMENT_TOKEN`、server `MANAGEMENT_AUTH_TOKEN`）。

**Tech Stack:** tRPC v11 (`@trpc/server` `@trpc/client` `@trpc/react-query`)、Fastify v5、React 19、@tanstack/react-query v5（已在 app 用）、drizzle-orm、zod v4、commander v12、electron-vite v5。

## Global Constraints

- 包管理器**严格使用 pnpm**，禁止 `npx`/`npm`/`yarn`，用 `pnpm exec`。
- 所有 `packages/*`、`server`、`app` 的相对 import 必须带 `.js` 后缀（tsc 不改写 specifiers），除 `app/` 内部 Vite 构建部分跟随该文件既有风格。
- `import type` 用于纯类型导入；server `AppRouter` 在 app/CLI 中**仅 `import type` 使用**，不得运行时引用。
- 让 `app#build`、`cli#build`、`app#typecheck`、`cli#typecheck` `dependsOn` 先构建 `@traceability/server`（turbo 已有 `^build` 规则，但本次需新增 `@traceability/server` 的 `exports`/`dist/trpc/app-router.d.ts`）。
- tRPC 版本统一为 v11；新增 catalog 项锁版本。
- server 依赖不变更 zod v4 / fastify v5 / drizzle-orm 既有版本。
- Conventional Commits：`feat` / `fix` / `chore` / `refactor` / `docs`；commitlint 前两单词不大写，subject 不 sentence-case。
- `SourceLocation.tsx` 组件源码**保留**，本次仅从 `issues/detail.tsx` 解引。
- 禁止引入 performance / rrweb replay / source-map / fix-loop / WS 相关代码。
- CI 校验门：`grep -R "@traceability/protocol\|@traceability/client" app packages server` 无命中；生产 renderer bundle `grep -R "@trpc/server" app/out/renderer` 无命中。

---

## 文件结构总览

**server（新增/删除）**
- 新增 `server/src/trpc/context.ts`、`server/src/trpc/trpc.ts`、`server/src/trpc/routers/{projects,issues,operations}.ts`、`server/src/trpc/app-router.ts`、`server/src/trpc/index.ts`
- 新增 `server/src/trpc/__tests__/router.test.ts`
- 删除 `server/src/domains/projects/routes.ts`、`server/src/domains/issues/routes.ts`、`server/src/domains/operations/routes.ts`
- 修改 `server/src/app.ts`（移除 swagger + register*Routes，挂 tRPC plugin）
- 修改 `server/src/__tests__/integration/*.test.ts`（路由从 `/api/v1/*` 改 `/api/trpc/*` 之处）
- 修改 `server/package.json`（exports 字段、依赖 @trpc/server）

**protocol / client（删除）**
- 删除 `packages/protocol/`、`packages/client/` 两个目录
- 修改 `pnpm-workspace.yaml`（移除两个包引用）
- 修改 `app/package.json`、`packages/cli/package.json`（移除两项依赖）

**app renderer**
- 新增 `app/src/renderer/lib/trpc.ts`、`app/src/renderer/lib/trpc-error-toaster.tsx`
- 删除 `app/src/renderer/lib/request.ts`、`app/src/renderer/lib/ws.ts`、`app/src/renderer/apis/`（整个目录）
- 删除 `app/src/renderer/pages/performance/`（整个目录）
- 重命名 `app/src/extensions/builtins/apps/` → `app/src/extensions/builtins/projects/`
- 修改 `app/electron.vite.config.ts`（生产 VITE_MANAGEMENT_TOKEN 校验）
- 修改 `app/src/renderer/App.tsx`、`router.tsx`、`vite-env.d.ts`、`hooks/*`、`context/current-app.tsx→current-project.tsx`、`pages/**`、`lib/utils.ts`、`extensions/builtins/{projects,issues}/**`

**app main**
- 新增 `app/src/main/trpc-client.ts`
- 修改 `app/src/main/env.d.ts`、`app/tsconfig.node.json`（groups 目录改名 include）

**CLI**
- 新增 `packages/cli/src/lib/trpc.ts`
- 重命名 `packages/cli/src/commands/app.ts` → `project.ts`
- 修改 `packages/cli/src/commands/{issue,config}.ts`、`packages/cli/src/lib/client.ts`、`packages/cli/src/index.ts`

**文档**
- 修改 `CLAUDE.md`、`AGENTS.md`、`packages/cli/README.md`（如有）
- 删除 `app/src/renderer/apis/README.md`

---

## Task 1: server 安装 tRPC 依赖并配置 d.ts 导出

**Files:**
- Modify: `server/package.json`
- Test: 无（依赖安装任务）

**Interfaces:**
- Consumes: 无
- Produces: `@trpc/server` v11 可用；`server/dist/trpc/app-router.d.ts` 由后续 build 产出（本 task 仅准备 package.json）

- [ ] **Step 1: 为 server 添加 tRPC 与 fastify adapter 依赖**

Run:
```bash
cd server && pnpm add @trpc/server@^11.4.3 @trpc/server-adapters-fastify@^11.4.3
cd .. && pnpm add -w @trpc/server@^11.4.3 @trpc/client@^11.4.3 @trpc/react-query@^11.4.3 --save-dev
```
说明：`-w` 把 client/react 三个包加到 workspace root devDependencies（app 与 cli 后续各自再 link；这样 catalog 不污染）。但 app/cli 也需要运行时依赖——稍后在 Task 6/7 通过 `pnpm --filter` 各自安装。

> 注意：如果 `@trpc/server-adapters-fastify` 在 v11 已合并进 `@trpc/server`，则只用 `@trpc/server`。先跑 `pnpm info @trpc/server@11.4.3` 确认；若不存在独立 adapter 包，跳过它。

- [ ] **Step 2: patch `server/package.json` 的 `exports` 字段以暴露纯类型子路径**

编辑 `server/package.json`，在顶层对象加入：
```json
  "exports": {
    "./trpc": {
      "types": "./dist/trpc/app-router.d.ts"
    }
  },
  "files": ["dist"]
```

并把 server build 改为产出 declaration：修改 `server/tsconfig.build.json`，把 `declaration: false` 改为 `declaration: true` 且 `declarationMap: false`。`tsconfig.json` 保持 `declaration: false`（typecheck 不生成）。

- [ ] **Step 3: 验证依赖安装成功**

Run:
```bash
pnpm install
pnpm --filter @traceability/server typecheck
```
Expected: typecheck 通过（尚未引用 tRPC，不会报错）。

- [ ] **Step 4: Commit**

```bash
git add pnpm-lock.yaml server/package.json server/tsconfig.build.json pnpm-workspace.yaml package.json
git commit -m "chore(server): add trpc deps and export ./trpc type subpath"
```

---

## Task 2: server tRPC context + procedure 骨架

**Files:**
- Create: `server/src/trpc/context.ts`
- Create: `server/src/trpc/trpc.ts`
- Test: `server/src/trpc/__tests__/trpc.test.ts`

**Interfaces:**
- Consumes: `server/src/config/runtime.ts` (`RuntimeConfig`)、`server/src/db/postgres.ts` (`PostgresDatabase`)、`server/src/infrastructure/auth/management-auth.ts`（已有 `createManagementAuth` 但返回 Fastify preHandler——本 task 改写一个 tRPC middleware 复用同样的 `MANAGEMENT_AUTH_TOKEN` 比较）
- Produces: `Context` interface `{ config; database; services }`；`managementProcedure`（已带 Bearer 验证的 procedure 工厂）；`t`（initTRPC 实例）

- [ ] **Step 1: 写失败测试 `server/src/trpc/__tests__/trpc.test.ts`**

```typescript
import { initTRPC } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { createManagementAuthMiddleware, t } from "../trpc.js";
import type { RuntimeConfig } from "../config/index.js";
import type { PostgresDatabase } from "../db/postgres.js";

function makeConfig(token: string): RuntimeConfig {
  return {
    environment: "development",
    host: "0.0.0.0",
    port: 3000,
    databaseUrl: "postgresql://x",
    databasePoolMax: 10,
    redisUrl: "redis://x",
    publicIngestUrl: "http://x",
    defaultOrganizationSlug: "traceability",
    defaultOrganizationName: "Traceability",
    managementAuthToken: token,
    ingestMaxCompressedBytes: 1024,
    ingestMaxDecompressedBytes: 1024,
    ingestMaxItems: 1,
    ingestMaxItemBytes: 1024,
    corsOrigins: [],
    trustProxy: false,
    logLevel: "info",
  };
}

describe("managementProcedure", () => {
  it("rejects when the bearer token is missing", async () => {
    const opts = {
      ctx: { config: makeConfig("secret"), database: {} as PostgresDatabase },
      type: "query" as const,
      path: "x",
      rawInput: undefined,
      req: { headers: { authorization: undefined } },
      res: undefined,
      signal: undefined,
    };
    const procedure = t.procedure.use(createManagementAuthMiddleware());
    const router = initTRPC.context<typeof opts.ctx>().create().router({ x: procedure.query(() => "ok") });
    const caller = router.createCaller(opts.ctx);
    await expect(
      (async () => {
        // Invoke through middleware manually: createCaller does not run middleware req inspection,
        // so call the middleware directly.
        const mw = createManagementAuthMiddleware();
        await mw(opts as any);
      })(),
    ).rejects.toThrow();
  });

  it("accepts a matching bearer token", async () => {
    const mw = createManagementAuthMiddleware();
    const opts2 = {
      ...{
        ctx: { config: makeConfig("secret"), database: {} as PostgresDatabase },
        type: "query" as const,
        path: "x",
        rawInput: undefined,
        req: { headers: { authorization: "Bearer secret" } },
        res: undefined,
        signal: undefined,
      },
    };
    await expect(mw(opts2 as any)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @traceability/server test -- src/trpc/__tests__/trpc.test.ts`
Expected: FAIL with "Cannot find module '../trpc.js'".

- [ ] **Step 3: 实现 `server/src/trpc/context.ts`**

```typescript
import type { PostgresDatabase } from "../db/postgres.js";
import type { RuntimeConfig } from "../config/index.js";

export interface Services {
  projects: import("../domains/projects/service.js").ProjectService;
  issues: import("../domains/issues/service.js").IssueService;
}

export interface Context {
  config: RuntimeConfig;
  database: PostgresDatabase;
  services: Services;
}
```

- [ ] **Step 4: 实现 `server/src/trpc/trpc.ts`**

```typescript
import { initTRPC, TRPCError } from "@trpc/server";
import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create();

export { t };

function safeEqual(left: string, right: string): boolean {
  const lb = Buffer.from(left);
  const rb = Buffer.from(right);
  return lb.length === rb.length && timingSafeEqual(lb, rb);
}

export function createManagementAuthMiddleware() {
  return t.middleware(async ({ ctx, next, type }) => {
    const req = (ctx as Context & { req?: FastifyRequest }).req;
    const authorization = req?.headers?.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token || !safeEqual(token, ctx.config.managementAuthToken)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "management authentication required" });
    }
    return next({ ctx });
  });
}

export const managementProcedure = t.procedure.use(createManagementAuthMiddleware());
```

> 注意：`req` 在 tRPC context 中需要由 fastify adapter 注入。本任务的测试直接构造 `ctx.req`；真正的注入在 Task 4 fastify plugin 里完成 `createContext`。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @traceability/server test -- src/trpc/__tests__/trpc.test.ts`
Expected: PASS（两条用例）。若 `createManagementAuthMiddleware` 的 `ctx.req` 类型报错，用 `as any` 临时绕过；后续 Task 4 修 createContext 类型。

> 若 `t.procedure.use(...)` 需要先有 router 才能调用，简化测试：直接复制 `createManagementAuthMiddleware()` 返回的 middleware，用 `t.middleware` 拿到的对象调用 — 上面 Step 1 测试已这样写。如果实现细节与 tRPC v11 API 略有出入，以**通过测试**为准调整（例如改为导出 `managementProcedure` 后在测试里建一个最简 router.createCaller 并手动注入 req 到 ctx）。

- [ ] **Step 6: Commit**

```bash
git add server/src/trpc/context.ts server/src/trpc/trpc.ts server/src/trpc/__tests__/trpc.test.ts
git commit -m "feat(server): add trpc context and management auth procedure"
```

---
## 后续任务索引（执行阶段按序推进，每任务一条 git commit）

> 完整 TDD 步骤在执行时展开。下列为每任务的 Files / Interfaces / Commit message。

### Task 3: server routers（projects / issues / operations）
- Create: `server/src/trpc/routers/projects.ts`, `issues.ts`, `operations.ts`
- Create: `server/src/trpc/app-router.ts` (`export const appRouter = router({...}); export type AppRouter = typeof appRouter`)
- Test: `server/src/trpc/__tests__/router.test.ts`（createCallerFactory，mock db）
- Interfaces: 用 `managementProcedure.input(zod).query/mutation`，service 来自 `domains/*/service.ts` 已有方法
- Commit: `feat(server): add v2 trpc routers for projects issues operations`

### Task 4: server 挂 fastifyTRPCPlugin + 移除 REST 路由与 swagger
- Create: `server/src/trpc/index.ts`（`registerTrpc(app)`）
- Modify: `server/src/app.ts`（删 swagger 注册、删 registerProjectRoutes/registerIssueRoutes/registerOperationsRoutes、增 `await registerTrpc(app, deps)`；envelope route 保留）
- Delete: `server/src/domains/{projects,issues,operations}/routes.ts`
- Modify: `server/src/__tests__/integration/*.test.ts`（更新断言）
- Test: 端到端 `app.inject({ url: "/api/trpc/projects.list", headers })`
- Commit: `refactor(server): serve management api over trpc drop rest routes`

### Task 5: 删除 @traceability/protocol 与 @traceability/client
- Delete: `packages/protocol/`, `packages/client/`
- Modify: `pnpm-workspace.yaml`（移除两包）；`app/package.json`、`packages/cli/package.json`（移除依赖）
- 此任务要求前置所有对其 import 的替换（Task 6/7/8 完成 import 切换后再物理删除可能更稳妥——但 spec 要求最终存在感为 0；执行时按"先改引用、再删包"在同一任务内完成，最后跑 grep gate）
- Commit: `refactor: remove traceability protocol and client packages`

### Task 6: app renderer 接入 tRPC + 删除 apis/request/ws/performance
- 参见 spec §4.4 文件结构
- Commit: `refactor(app): switch renderer to trpc drop legacy data layer`

### Task 7: app renderer Application→Project 重命名 + IssueStatus 收敛 + Resolve detail
- 参见 spec §3 概念映射
- Commit: `refactor(app): rename application to project and collapse issue status`

### Task 8: app main trpc client + extensions（apps→projects）
- 参见 spec §4.5
- Commit: `feat(app): wire main process and builtin extensions to trpc`

### Task 9: packages/cli 迁移到 tRPC
- 参见 spec §4.6
- Commit: `refactor(cli): migrate to trpc and rename app to project`

### Task 10: 文档 + CI gate
- Modify: `CLAUDE.md`, `AGENTS.md`, `packages/cli/README.md`；删 `app/src/renderer/apis/README.md`
- 新增 CI 校验脚本（grep gates）到 `.github/workflows/*` 或 package.json `scripts`
- Commit: `docs: update for trpc based server ingestion`

### Task 11: 端到端验证
- 跑 `pnpm install && pnpm build && pnpm test && pnpm type-check && pnpm lint`
- 手动 `pnpm dev:app` + server dev smoke
- Commit: `chore: verify full pipeline passes`
