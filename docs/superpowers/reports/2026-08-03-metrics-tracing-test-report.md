# Metrics 与 Trace/Span 测试报告

日期：2026-08-03

## 结论

新增 Metrics、Trace/Span、`trace_metric`、worker processor 和 Monitor transport 功能已通过验证。

## 验证环境

- Docker Desktop PostgreSQL 15 与 Redis。
- 使用隔离测试容器：PostgreSQL `127.0.0.1:54329`、Redis `127.0.0.1:56379`。
- 在全新数据库执行 Drizzle migrations `0000`–`0010`。
- 测试结束后隔离容器已清理；原开发容器未被删除。

## 测试结果

| 范围 | 结果 |
| --- | --- |
| Server | 20 个测试文件，56 个测试通过 |
| Monitor | 2 个测试文件，4 个测试通过 |
| Electron App | 10 个测试文件，70 个测试通过 |
| CLI | 8 个测试文件，32 个测试通过 |
| Web Demo | 1 个测试文件，27 个测试通过 |
| 根级 `pnpm test` | 8 个 Turbo tasks 全部通过 |
| 根级 `pnpm type-check` | 7 个 tasks 全部通过 |
| 根级 `pnpm build` | 6 个 tasks 全部通过 |
| `pnpm exec oxlint` | 通过 |
| `git diff --check` | 通过 |

## 新增功能覆盖

- Envelope 协议：transaction、单 Span、Span v2 容器、`trace_metric` v2、版本/`item_count`/ID/时间/有限数值/typed attributes/属性上限校验。
- Ingest：durable acknowledgement、outbox topic、旧 `statsd` ignored、Policy 禁用、scrub、invalid disposition。
- Worker processor：transaction 根节点与子 Span、v1/v2 Span、trace metric sample 幂等写入。
- Metrics：counter sum、gauge latest/min/max/avg、distribution count/sum/min/max/avg/p50/p95/p99、时间桶、单位隔离、trace/span/typed attribute 过滤。
- Trace：嵌套树、多根、缺失父节点 orphan 标记、环路标记、根 Span 过滤、分页和错误/Metric 关联。
- HTTP E2E：真实 `app.listen` + `fetch` 发送 Envelope，并通过 HTTP 查询 `traces.list/get` 与 `metrics.catalog/series`。
- Monitor transport：真实 Sentry transport 捕获 transaction 与 `trace_metric`，验证 active span 的 trace/span 关联。

## 执行命令

```bash
TEST_DATABASE_URL=postgresql://traceability:traceability@127.0.0.1:54329/traceability \
TEST_REDIS_URL=redis://127.0.0.1:56379 \
pnpm test

pnpm type-check
pnpm build
pnpm exec oxlint
git diff --check
```

HTTP E2E 测试文件：[server/src/__tests__/telemetry.e2e.test.ts](../../../server/src/__tests__/telemetry.e2e.test.ts)

说明：E2E 使用同一套 worker processor registry 在进程内执行处理，以保持测试确定性；BullMQ 独立进程部署编排不属于本轮功能范围。
