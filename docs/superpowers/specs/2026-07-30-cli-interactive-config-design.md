# CLI Interactive Config — Design

**Date**: 2026-07-30
**Package**: `packages/cli`
**Status**: Approved for planning

## Problem

`traceability` CLI 目前要求用户先运行 `traceability config set --server ... --token ...` 才能调用管理接口。没配置或 token 失效时命令直接失败(`management authentication required`, exit 2),对首次使用者不直观。

期望:命令执行时若 server/token 缺失或被服务端拒绝,自动弹出交互式输入框;用户填写完成后继续执行原命令。非交互式环境(CI)保持现有报错退出行为。

## Goals

1. 首次运行需要 server 的命令 → 自动进入配置向导,完成后继续执行。
2. 服务端返回 401 → 自动重新弹 prompt,输入完成后透明重试一次。
3. 非交互式(无 TTY)环境保持"报错 + 引导 + exit 2",不阻塞 CI。
4. 现有 `traceability config set / show`、`--server` / `--token` flag、`TRACEABILITY_MANAGEMENT_TOKEN` 环境变量继续可用。

## Non-Goals

- 不做独立的 `traceability config init` 命令(首次向导已覆盖)。
- 不做服务端连通性/健康检查预检。
- 不改动 config 存储位置、结构或默认值语义。
- 不涉及 CLI 之外的 package。

## Architecture

```
src/index.ts                  Commander 入口,setConfigOverrides 保持不变
    │
    ▼
src/commands/{project,issue,sourcemap}.ts
    └─ const client = await getTrpcClient()   ← 从 sync 改 async
       client.projects.list.query()           ← 其余保持
    │
    ▼
src/lib/trpc.ts               改造:async + reauthLink
    │
    ▼
src/lib/config-interactive.ts (新增)
    ├─ isInteractive(): boolean
    ├─ ensureConfig(): Promise<CliConfig>          // 首次门户
    └─ reconfigureAfter401(cur): Promise<CliConfig>  // 401 兜底

src/lib/config.ts             微调:export configPath()
```

**保持不变**:`getConfig` / `saveConfig` / `DEFAULT_SERVER` / `DEFAULT_TOKEN` / env 优先级 / Commander `preAction` + `setConfigOverrides`。

## Interfaces

### `src/lib/config-interactive.ts`(新增)

```ts
import { input, password } from "@inquirer/prompts";
import { existsSync } from "node:fs";

import {
  DEFAULT_SERVER,
  DEFAULT_TOKEN,
  configPath,
  getConfig,
  saveConfig,
  type CliConfig,
} from "./config.js";

/** stdin 和 stderr 都是 TTY 才算交互式(inquirer 通过 stderr 输出 prompt)。*/
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

export class NonInteractiveAuthError extends Error {
  readonly code = "NON_INTERACTIVE_AUTH";
}

/**
 * 首次门户:确保当前上下文能拿到 server + token。
 * - 已有完整 config (token 非空)      → 直接返回 getConfig()
 * - TTY + 缺失                         → prompt (预填 DEFAULT_*) → saveConfig → 返回
 * - 非 TTY + 缺失                      → 回退到 getConfig() 的默认值,不写盘
 */
export async function ensureConfig(): Promise<CliConfig>;

/**
 * 401 兜底:强制重新 prompt,预填当前 server;token 不预填。
 * - TTY   → prompt → saveConfig → 返回新 config
 * - 非 TTY → 抛 NonInteractiveAuthError
 *
 * 注意:当 token 来自 TRACEABILITY_MANAGEMENT_TOKEN 环境变量时,直接抛
 * NonInteractiveAuthError(即使 TTY 也不 prompt),避免把 env 意图误覆盖为 config.json。
 */
export async function reconfigureAfter401(current: CliConfig): Promise<CliConfig>;
```

**"配置缺失"定义**:

- `~/.traceability/config.json` 不存在,**或**
- 存在但 `token` 字段为空字符串。

`server` 缺失不算缺失,`DEFAULT_SERVER` 兜底即可。

**Prompt UX**:

- `input({ message: "Server URL", default: current.server ?? DEFAULT_SERVER })`
- `password({ message: "Management token", mask: "*" })`(不预填,回车即空 → 视为 abort 抛错)

**中断处理**:`@inquirer/prompts` 的 `ExitPromptError` **不捕获**,由 `src/index.ts` 顶层 `parseAsync().catch` 识别 `err.name === "ExitPromptError"` → 打印 `Aborted.` → `process.exitCode = 130`。

### `src/lib/trpc.ts`(改造)

```ts
export async function getTrpcClient(): Promise<TRPCClient<AppRouter>> {
  let cfg = await ensureConfig();
  return createTRPCClient<AppRouter>({
    links: [
      reauthLink(
        () => cfg,
        (next) => { cfg = next; },
      ),
      httpBatchLink({
        url: `${cfg.server.replace(/\/$/, "")}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${cfg.token}` }),
      }),
    ],
  });
}
```

`reauthLink` 是自定义 `TRPCLink<AppRouter>`,基于 `observable`:

- 订阅下游 op;`error` 回调里判断 `TRPCClientError` 的 `data.code === "UNAUTHORIZED"` 或 `data.httpStatus === 401`。
- 命中 → `await reconfigureAfter401(cfg)`,更新闭包中的 `cfg`,重发**一次**op(用 `op$` 重新 subscribe,或标记 `retried` 标志防死循环)。
- `reconfigureAfter401` 抛出 → 原 401 错误继续冒泡。
- 其他错误 → 原样透传。

`httpBatchLink` 的 `headers` 是函数,天然读到闭包最新 `cfg.token`。`url` 由于是在 link 构造期读取的字符串,401 后如果用户改了 server,新 client 也不会重建;但按需求语义,只有 token 变化才是"重新认证"的合理场景 —— server URL 若被用户改动,当前请求会自然失败并进入下一轮报错;这一点在文档里说明,不做额外处理。

### `src/lib/config.ts`(微调)

- 把内部 `configPath()` 函数 export 出去(供 `ensureConfig` 判断存在性)。
- 其他 API/默认值不变。

### 命令 action 改动

`project.ts` / `issue.ts` / `sourcemap.ts` 内所有 `getTrpcClient().xxx.query(...)` 拆成:

```ts
const client = await getTrpcClient();
const result = await client.xxx.query(...);
```

影响范围:约 10 处调用,机械替换,无逻辑变化。

## Data Flow

### 首次运行(TTY,无 config.json)

1. Commander 解析、`preAction` 保存 CLI overrides。
2. action → `await getTrpcClient()` → `ensureConfig()`。
3. `existsSync(configPath()) === false` + `isInteractive() === true`。
4. `input` + `password` prompt → `saveConfig({ server, token })`,权限 0600。
5. `console.error("Saved to ~/.traceability/config.json.")`。
6. 命令继续,tRPC 携带 Bearer token 请求 → 结果输出。

### 401 兜底(TTY)

1. tRPC 请求返回 401 / UNAUTHORIZED。
2. `reauthLink` 拦截:`console.error("Server rejected the management token. Please re-enter your credentials.")`。
3. `reconfigureAfter401(cfg)` → prompt(server 预填当前值)→ `saveConfig`。
4. 重发一次 op。成功 → 命令继续;再次 401 → 冒泡为普通 UNAUTHORIZED → exit 2。

### 非 TTY(CI)

- **首次门户**:`isInteractive() === false` → `ensureConfig` 返回 `getConfig()` 默认值(DEFAULT_SERVER + DEFAULT_TOKEN,不写盘)。请求发出,服务端接受则成功,拒绝则走 401 分支。
- **401 兜底**:`reconfigureAfter401` 抛 `NonInteractiveAuthError`。`reauthLink` 捕获后重抛原始 401。`index.ts` 顶层 catch 打印:

  ```
  Error: management authentication required
  Set credentials via `traceability config set --server <url> --token <token>`,
  or pass --server / --token flags, or export TRACEABILITY_MANAGEMENT_TOKEN.
  ```

  exit code 2(沿用现有 UNAUTHORIZED 分支)。

### env token 场景

`TRACEABILITY_MANAGEMENT_TOKEN` 存在时:

- `getConfig()` 返回该 token,视为"有配置",`ensureConfig` 不弹 prompt。
- 若服务端 401 → `reconfigureAfter401` 检测到 token 来自 env(通过重新读取 `process.env.TRACEABILITY_MANAGEMENT_TOKEN` 且与 `current.token` 相等判断),直接抛 `NonInteractiveAuthError` → 原错误冒泡 → 报错退出。
- 目的:避免"env 强意图"被 prompt 静默覆盖为 config.json。用户需自行 unset env 或修正。

## Error Handling

| 场景 | 表现 | Exit Code |
|------|------|-----------|
| 首次配置成功 | 提示 "Saved..." + 命令正常输出 | 0 |
| 401 → 重新 prompt → 成功 | 提示 + 输出 | 0 |
| 401 → 重新 prompt → 再 401 | 原 UNAUTHORIZED 错误 | 2 |
| 非 TTY + 401 | 报错 + 引导语 | 2 |
| Ctrl+C 在 prompt 期间 | "Aborted." | 130 |
| 其他 tRPC 错误 | 原样冒泡 | 1 |

## Testing

### 单元测试 `packages/cli/src/lib/config-interactive.test.ts`(新增)

用 `vi.mock("@inquirer/prompts")` + `TRACEABILITY_CONFIG_PATH` 指向 tmp 文件:

1. `ensureConfig` 已有完整 config → 不调 prompt,返回读到的值
2. `ensureConfig` 非 TTY + 无 config → 返回 DEFAULT_*,不落盘
3. `ensureConfig` TTY + 无 config → prompt 被调 → saveConfig 落盘 → 返回新值
4. `ensureConfig` TTY + 有 config 但 token 为空 → 触发 prompt
5. `reconfigureAfter401` 非 TTY → 抛 `NonInteractiveAuthError`
6. `reconfigureAfter401` TTY + token 来自 env → 抛 `NonInteractiveAuthError`
7. `reconfigureAfter401` TTY + token 来自 config → prompt → saveConfig → 返回新值
8. `ExitPromptError` 冒泡不吞

### 集成测试 `packages/cli/src/lib/trpc.test.ts`(新增)

Mock `fetch`(或 `@trpc/client` 层)构造 401/200 序列:

1. 首次 401 + 二次 200 → prompt 被调 1 次 + fetch 2 次 + 结果正确
2. 首次 401 + 二次 401 → prompt 被调 1 次 + fetch 2 次 + 抛 UNAUTHORIZED
3. `getTrpcClient()` 返回类型仍是 `TRPCClient<AppRouter>`(类型层校验,`typecheck` 覆盖)

### 手工验证清单

1. `rm ~/.traceability/config.json && pnpm --filter @traceability/cli dev project list` → 弹 prompt → 输入完成 → 命令继续
2. `jq '.token = "bad"' ~/.traceability/config.json | sponge ~/.traceability/config.json` → 同上命令 → 401 提示 → prompt → 输入正确 → 成功
3. `echo "" | pnpm --filter @traceability/cli dev project list` → 不弹 prompt、报错 + 引导语、exit 2
4. `TRACEABILITY_MANAGEMENT_TOKEN=bad pnpm --filter @traceability/cli dev project list` → 401 → **不**弹 prompt → 报错 exit 2

### 验收标准

- `pnpm --filter @traceability/cli typecheck` 通过
- `pnpm --filter @traceability/cli test` 通过
- 手工清单 4 条全绿

## Files Touched

| 文件 | 动作 |
|------|------|
| `packages/cli/src/lib/config.ts` | 微调:export `configPath` |
| `packages/cli/src/lib/config-interactive.ts` | 新增 |
| `packages/cli/src/lib/config-interactive.test.ts` | 新增 |
| `packages/cli/src/lib/trpc.ts` | 改造为 async + reauthLink |
| `packages/cli/src/lib/trpc.test.ts` | 新增 |
| `packages/cli/src/commands/project.ts` | `await getTrpcClient()` 拆分 |
| `packages/cli/src/commands/issue.ts` | 同上 |
| `packages/cli/src/commands/sourcemap.ts` | 同上 |
| `packages/cli/src/index.ts` | 顶层 catch 识别 `ExitPromptError` → exit 130 |
| `packages/cli/README.md` | 更新首次配置说明(可选,若已存在类似段落则微调) |

## Risks & Mitigations

- **`getTrpcClient()` 由 sync 改 async 的传染面**:命令 action 本来就是 async,加一个 `await` 无副作用;`typecheck` 会强制暴露漏改点。
- **`reauthLink` 死循环**:严格"最多重试一次"标志位,再 401 直接放行错误。
- **env token 被静默覆盖**:`reconfigureAfter401` 显式检测并拒绝。
- **`password` prompt 无法预填**:文档化;用户 401 后重输是可接受的成本。
