# `@traceability/server`

Traceability 的 Fastify 服务端，负责 Sentry 兼容的事件接收、PostgreSQL 持久化、tRPC 管理接口，以及基于 Redis/BullMQ 的异步事件处理。

该 package 当前是 monorepo 内部 package（`private: true`），通过 workspace script 运行。

## 前置依赖

- Node.js 20+
- pnpm 10+
- Docker（可选，用于 `pnpm db:up` 一键启动基础设施）
- PostgreSQL
- Redis
- MinIO（可选，仅在需要 sourcemap 处理时必需）

## 启动流程

### 1. 启动基础设施（PostgreSQL + Redis + MinIO）

```bash
pnpm db:up
```

等价于 `docker compose -f compose.dev.yml up -d`，执行后会启动：

| 服务 | 端口 | 用途 |
|------|------|------|
| PostgreSQL 15 | `5432` | 主数据库（DB: traceability, 用户: traceability） |
| Redis | `6379` | BullMQ 队列 |
| MinIO | `9000` / `9001` | 对象存储（sourcemap 文件） |

如果本地已有独立运行的 PostgreSQL/Redis，也可以直接跳过此步。MinIO 仅在需要 sourcemap 处理时必需。

对应关闭命令：

```bash
pnpm db:down
```

### 2. 初始化数据库

```bash
pnpm db:migrate
```

首次启动必须执行，用于创建各 domain 的数据表。修改 domain schema 后重新生成并执行迁移：

```bash
pnpm db:generate
pnpm db:migrate
```

数据库表定义位于 `src/domains/*/db.ts`，统一由 `src/db/schema.ts` 聚合。

快速一步到位：

```bash
pnpm db:setup   # db:up + sleep 2 + db:migrate
```

### 3. 启动 Service

server 由**三个独立进程**组成，需分别启动：

| 进程 | 开发命令 | 生产命令 | 文件 | 职责 |
|------|---------|---------|------|------|
| **HTTP Server** | `pnpm dev` | `pnpm start` | `src/app.ts` | Fastify API，接收 Sentry envelope 和 tRPC 请求 |
| **Dispatcher** | `pnpm dev:dispatcher` | `pnpm start:dispatcher` | `src/dispatcher.ts` | 将 ingest 事件分发到 BullMQ 队列 |
| **Worker** | `pnpm dev:worker` | `pnpm start:worker` | `src/worker.ts` | 消费队列，处理事件（sourcemap 解析等） |

推荐在三个独立终端中分别运行：

```bash
# 终端 1 — HTTP Server
pnpm dev

# 终端 2 — Dispatcher
pnpm dev:dispatcher

# 终端 3 — Worker
pnpm dev:worker
```

三者的协作关系：

```
HTTP Server (app.ts)
  └─ 收到 Sentry envelope → 写入数据库
      → Dispatcher 分发任务到 Redis 队列
          → Worker 消费队列 → 处理事件（sourcemap symbolication 等）
```

API 运行后可访问：

- `GET /health/live`：进程存活检查
- `GET /health/ready`：PostgreSQL 和 Redis 就绪检查
- `GET /metrics`：Prometheus 指标，需要 management token
- `POST /api/{projectId}/envelope/`：Sentry envelope 接收入口
- `/trpc-panel`：非 production 环境下的 tRPC 调试面板

## 配置

在 `server/` 目录下创建 `.env`，至少配置：

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://traceability:traceability@127.0.0.1:5432/traceability
DATABASE_POOL_MAX=10
REDIS_URL=redis://127.0.0.1:6379
PUBLIC_INGEST_URL=http://127.0.0.1:3000
MANAGEMENT_AUTH_TOKEN=replace-with-a-long-random-token
```

可选配置包括 `CORS_ORIGINS`、`TRUST_PROXY`、`LOG_LEVEL`，以及 ingest 的大小和数量限制：
`INGEST_MAX_COMPRESSED_BYTES`、`INGEST_MAX_DECOMPRESSED_BYTES`、`INGEST_MAX_ITEMS`、`INGEST_MAX_ITEM_BYTES`。

生产环境必须设置 `MANAGEMENT_AUTH_TOKEN`。

## 构建与生产运行

```bash
pnpm build                 # tsc 编译
pnpm start                 # node dist/app.js
pnpm start:dispatcher      # node dist/dispatcher.js
pnpm start:worker          # node dist/worker.js
```

API、dispatcher 和 worker 应作为独立进程运行，并共享同一套 PostgreSQL、Redis 配置。

## 校验与测试

```bash
pnpm --filter @traceability/server typecheck
pnpm --filter @traceability/server test
pnpm --filter @traceability/server test:integration
```

集成测试需要设置 `TEST_DATABASE_URL`，否则 PostgreSQL 集成测试会被跳过。

## 在 workspace package 中使用 tRPC 类型

server 对外提供 router 类型声明，供 app 或 CLI 使用：

```ts
import type {
  AppRouter,
  AppRouterInputs,
  AppRouterOutputs,
} from "@traceability/server/trpc";
```

这些类型来自 server 的 `src/trpc/app-router.ts`，不会将 server runtime 打包进 renderer。
