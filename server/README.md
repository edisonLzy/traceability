# `@traceability/server`

Traceability 的 Fastify 服务端，负责 Sentry 兼容的事件接收、PostgreSQL 持久化、tRPC 管理接口，以及基于 Redis/BullMQ 的异步事件处理。

该 package 当前是 monorepo 内部 package（`private: true`），通过 workspace script 运行。

## 前置依赖

- Node.js 20+
- pnpm 10+
- PostgreSQL
- Redis

## 配置

在仓库根目录创建 `.env`，至少配置：

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

## 初始化数据库

在仓库根目录安装依赖后，执行：

```bash
pnpm --filter @traceability/server db:migrate
```

修改 domain schema 后生成迁移：

```bash
pnpm --filter @traceability/server db:generate
pnpm --filter @traceability/server db:migrate
```

各 domain 的表定义位于 `src/domains/*/db.ts`，统一由 `src/db/schema.ts` 聚合。

## 开发运行

启动 API：

```bash
pnpm --filter @traceability/server dev
```

API 运行后：

- `GET /health/live`：进程存活检查
- `GET /health/ready`：PostgreSQL 和 Redis 就绪检查
- `GET /metrics`：Prometheus 指标，需要 management token
- `POST /api/{projectId}/envelope/`：Sentry envelope 接收入口
- `/trpc-panel`：非 production 环境下的 tRPC 调试面板

启动异步处理所需的 dispatcher 和 worker：

```bash
pnpm --filter @traceability/server dev:dispatcher
pnpm --filter @traceability/server dev:worker
```

## 构建与生产运行

```bash
pnpm --filter @traceability/server build
pnpm --filter @traceability/server start
pnpm --filter @traceability/server start:dispatcher
pnpm --filter @traceability/server start:worker
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
