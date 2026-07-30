# CLI Interactive Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当用户执行需要 server 的 CLI 命令时,如果 server/token 缺失就自动弹交互式输入框,401 也自动重新引导并透明重试。

**Architecture:** 新增 `config-interactive.ts` 作为唯一的"是否 prompt / 是否落盘"决策点。`getTrpcClient()` 改 async 并加自定义 `reauthLink` 兜底 401。原生 fetch 路径(`uploadSourcemap`)同样通过 `ensureConfig` 走门户,并显式检测 401 手动重试。非 TTY 环境保留现有 fail-fast 行为。

**Tech Stack:** TypeScript, Node 22, pnpm, `@inquirer/prompts` v8, `@trpc/client` v11, `commander` v12, `vitest` v4。

**Spec:** `docs/superpowers/specs/2026-07-30-cli-interactive-config-design.md`

## Global Constraints

- Package: **`packages/cli`** only。禁止跨 package 修改。
- 模块类型 ESM,相对 import 必须带 `.js` 后缀(源码是 `.ts`,`tsc` 不改写 specifier)。
- 使用 `import type` 引入类型专用符号。
- 严格 TypeScript(`strict` + `noUncheckedIndexedAccess`);跑 `pnpm --filter @traceability/cli typecheck`。
- 只用 pnpm(不用 npx/npm/yarn);单测用 `pnpm --filter @traceability/cli test`。
- Commit 用 Conventional Commits(`feat`/`fix`/`chore`/`test`/`docs`);header 不做长度限制,body 也可以随意。
- 保持 `DEFAULT_SERVER = "http://localhost:3000"` 和 `DEFAULT_TOKEN = "traceability-development-token"` 语义不变;这两个只是 prompt 预填值和非 TTY 兜底值。
- exit code:成功 0、常规失败 1、UNAUTHORIZED 或非 TTY 配置缺失 2、Ctrl+C 中断 130。

---

## File Structure

**新增:**
- `packages/cli/src/lib/config-interactive.ts` — 交互式配置门户
- `packages/cli/src/lib/config-interactive.test.ts` — 门户单测
- `packages/cli/src/lib/trpc.test.ts` — reauthLink 集成测

**修改:**
- `packages/cli/src/lib/config.ts` — export `configPath`
- `packages/cli/src/lib/trpc.ts` — async + reauthLink
- `packages/cli/src/lib/upload.ts` — 走 `ensureConfig` + 401 手动重试
- `packages/cli/src/commands/project.ts` — 5 处 `await getTrpcClient()`
- `packages/cli/src/commands/issue.ts` — 2 处 `await getTrpcClient()`
- `packages/cli/src/index.ts` — 顶层 catch 识别 `ExitPromptError` → exit 130
- `packages/cli/README.md` — 更新首次运行说明(如果存在)

---

### Task 1: 暴露 `configPath()` 并回归验证

**Files:**
- Modify: `packages/cli/src/lib/config.ts`

**Interfaces:**
- Produces: `export function configPath(): string`

- [ ] **Step 1: 修改 config.ts,把 configPath 从内部函数改成 exported**

`packages/cli/src/lib/config.ts` 第 24 行原样是:

```ts
function configPath(): string {
  return process.env.TRACEABILITY_CONFIG_PATH ?? join(homedir(), ".traceability", "config.json");
}
```

改为:

```ts
export function configPath(): string {
  return process.env.TRACEABILITY_CONFIG_PATH ?? join(homedir(), ".traceability", "config.json");
}
```

- [ ] **Step 2: 跑现有测试确认没回归**

Run: `pnpm --filter @traceability/cli test -- src/lib/config.test.ts`
Expected: PASS(2 个用例)

- [ ] **Step 3: typecheck 通过**

Run: `pnpm --filter @traceability/cli typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/lib/config.ts
git commit -m "chore(cli): export configPath for reuse in interactive module"
```

---

### Task 2: `isInteractive()` 与 `NonInteractiveAuthError`

**Files:**
- Create: `packages/cli/src/lib/config-interactive.ts`
- Create: `packages/cli/src/lib/config-interactive.test.ts`

**Interfaces:**
- Consumes: (none)
- Produces:
  - `export function isInteractive(): boolean`
  - `export class NonInteractiveAuthError extends Error { readonly code: "NON_INTERACTIVE_AUTH" }`

- [ ] **Step 1: 写失败测试**

Create `packages/cli/src/lib/config-interactive.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

import { NonInteractiveAuthError, isInteractive } from "./config-interactive.js";

const originalStdinTTY = process.stdin.isTTY;
const originalStderrTTY = process.stderr.isTTY;

afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", { value: originalStdinTTY, configurable: true });
  Object.defineProperty(process.stderr, "isTTY", { value: originalStderrTTY, configurable: true });
});

describe("isInteractive", () => {
  it("returns true when both stdin and stderr are TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(isInteractive()).toBe(true);
  });

  it("returns false when stdin is not a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(isInteractive()).toBe(false);
  });

  it("returns false when stderr is not a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(isInteractive()).toBe(false);
  });
});

describe("NonInteractiveAuthError", () => {
  it("carries a stable code", () => {
    const err = new NonInteractiveAuthError("no tty");
    expect(err.code).toBe("NON_INTERACTIVE_AUTH");
    expect(err.message).toBe("no tty");
    expect(err).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @traceability/cli test -- src/lib/config-interactive.test.ts`
Expected: FAIL(找不到 `./config-interactive.js`)

- [ ] **Step 3: 最小实现**

Create `packages/cli/src/lib/config-interactive.ts`:

```ts
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

export class NonInteractiveAuthError extends Error {
  readonly code = "NON_INTERACTIVE_AUTH" as const;
  constructor(message: string) {
    super(message);
    this.name = "NonInteractiveAuthError";
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @traceability/cli test -- src/lib/config-interactive.test.ts`
Expected: PASS(4 个用例)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/config-interactive.ts packages/cli/src/lib/config-interactive.test.ts
git commit -m "feat(cli): add interactive config primitives (isInteractive, NonInteractiveAuthError)"
```

---

### Task 3: `ensureConfig()` — 首次门户

**Files:**
- Modify: `packages/cli/src/lib/config-interactive.ts`
- Modify: `packages/cli/src/lib/config-interactive.test.ts`

**Interfaces:**
- Consumes:
  - `configPath()` from Task 1
  - `getConfig`, `saveConfig`, `DEFAULT_SERVER`, `DEFAULT_TOKEN`, `type CliConfig` from `./config.js`
  - `input`, `password` from `@inquirer/prompts`
- Produces: `export async function ensureConfig(): Promise<CliConfig>`

**门户判定规则:**
- `configPath()` 指向的文件存在,读出的 `token` 字段非空 → 直接 `getConfig()` 返回
- 文件不存在 或 存在但 token 空/无:
  - TTY → prompt 两个字段 → `saveConfig` → 返回
  - 非 TTY → 返回 `getConfig()`(即默认值),不写盘

- [ ] **Step 1: 追加失败测试**

在 `config-interactive.test.ts` 顶部加 import:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, vi } from "vitest";

import { ensureConfig } from "./config-interactive.js";
```

并在文件末尾追加:

```ts
vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  password: vi.fn(),
}));

const inquirer = await import("@inquirer/prompts");

describe("ensureConfig", () => {
  let tmp: string;
  let originalConfigPath: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "traceability-cli-cfg-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    process.env.TRACEABILITY_CONFIG_PATH = join(tmp, "config.json");
    delete process.env.TRACEABILITY_SERVER_URL;
    delete process.env.TRACEABILITY_MANAGEMENT_TOKEN;
    vi.mocked(inquirer.input).mockReset();
    vi.mocked(inquirer.password).mockReset();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
    else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
  });

  it("returns stored config without prompting when token is present", async () => {
    writeFileSync(
      process.env.TRACEABILITY_CONFIG_PATH as string,
      JSON.stringify({ server: "https://stored.example", token: "stored-token" }),
    );
    const cfg = await ensureConfig();
    expect(cfg).toEqual({ server: "https://stored.example", token: "stored-token" });
    expect(inquirer.input).not.toHaveBeenCalled();
    expect(inquirer.password).not.toHaveBeenCalled();
  });

  it("falls back to defaults without prompting when non-interactive", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    const cfg = await ensureConfig();
    expect(cfg.server).toBe("http://localhost:3000");
    expect(cfg.token).toBe("traceability-development-token");
    expect(inquirer.input).not.toHaveBeenCalled();
  });

  it("prompts and persists when TTY and no config", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    vi.mocked(inquirer.input).mockResolvedValueOnce("https://prompted.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("prompted-token");
    const cfg = await ensureConfig();
    expect(cfg).toEqual({ server: "https://prompted.example", token: "prompted-token" });
    expect(inquirer.input).toHaveBeenCalledTimes(1);
    expect(inquirer.password).toHaveBeenCalledTimes(1);
    // Persisted:
    const written = await import("node:fs/promises").then((m) =>
      m.readFile(process.env.TRACEABILITY_CONFIG_PATH as string, "utf8"),
    );
    expect(JSON.parse(written)).toEqual({
      server: "https://prompted.example",
      token: "prompted-token",
    });
  });

  it("prompts when config exists but token is empty", async () => {
    writeFileSync(
      process.env.TRACEABILITY_CONFIG_PATH as string,
      JSON.stringify({ server: "https://stored.example", token: "" }),
    );
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    vi.mocked(inquirer.input).mockResolvedValueOnce("https://stored.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("new-token");
    const cfg = await ensureConfig();
    expect(cfg.token).toBe("new-token");
    expect(inquirer.input).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @traceability/cli test -- src/lib/config-interactive.test.ts`
Expected: FAIL(`ensureConfig` 未导出)

- [ ] **Step 3: 实现 `ensureConfig`**

在 `packages/cli/src/lib/config-interactive.ts` 追加:

```ts
import { existsSync, readFileSync } from "node:fs";

import { input, password } from "@inquirer/prompts";

import {
  DEFAULT_SERVER,
  DEFAULT_TOKEN,
  configPath,
  getConfig,
  saveConfig,
  type CliConfig,
} from "./config.js";

/** Returns the token currently stored on disk (if any), independent of env overrides. */
function storedToken(): string | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CliConfig>;
    return typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : null;
  } catch {
    return null;
  }
}

/**
 * First-run gate:
 * - If config.json has a non-empty token → return getConfig() as-is.
 * - Non-TTY + missing → return getConfig() (defaults), do NOT write to disk.
 * - TTY + missing → prompt for server/token, saveConfig, return the new values.
 */
export async function ensureConfig(): Promise<CliConfig> {
  const existing = storedToken();
  if (existing !== null) return getConfig();

  if (!isInteractive()) return getConfig();

  const cfg = await runPrompt({ serverDefault: DEFAULT_SERVER });
  saveConfig(cfg);
  process.stderr.write(`Saved to ${configPath()}.\n`);
  return cfg;
}

async function runPrompt(opts: { serverDefault: string }): Promise<CliConfig> {
  const server = await input({
    message: "Server URL",
    default: opts.serverDefault,
  });
  const token = await password({
    message: "Management token",
    mask: "*",
  });
  if (!token || token.length === 0) {
    throw new Error("management token is required");
  }
  return { server: server.trim() || DEFAULT_SERVER, token };
}
```

注意 `DEFAULT_TOKEN` 只作为**非 TTY 兜底**通过 `getConfig()` 生效,prompt 里**不**预填 token(密码字段更严谨)。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @traceability/cli test -- src/lib/config-interactive.test.ts`
Expected: PASS(全部用例,共 8 个)

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @traceability/cli typecheck`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/config-interactive.ts packages/cli/src/lib/config-interactive.test.ts
git commit -m "feat(cli): ensureConfig first-run gate with TTY-aware prompt"
```

---

### Task 4: `reconfigureAfter401()`

**Files:**
- Modify: `packages/cli/src/lib/config-interactive.ts`
- Modify: `packages/cli/src/lib/config-interactive.test.ts`

**Interfaces:**
- Consumes: `input`, `password`, `saveConfig`, `NonInteractiveAuthError`, `isInteractive`
- Produces: `export async function reconfigureAfter401(current: CliConfig): Promise<CliConfig>`

**规则:**
- 非 TTY → 抛 `NonInteractiveAuthError`
- token 当前来自 env `TRACEABILITY_MANAGEMENT_TOKEN`(即 `process.env.TRACEABILITY_MANAGEMENT_TOKEN === current.token`) → 抛 `NonInteractiveAuthError`(避免静默覆盖 env 意图)
- 其他 → prompt(server 预填 `current.server`) → saveConfig → 返回

- [ ] **Step 1: 追加失败测试**

在 `config-interactive.test.ts` 追加:

```ts
import { reconfigureAfter401 } from "./config-interactive.js";

describe("reconfigureAfter401", () => {
  beforeEach(() => {
    vi.mocked(inquirer.input).mockReset();
    vi.mocked(inquirer.password).mockReset();
  });

  it("throws NonInteractiveAuthError when not TTY", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    await expect(
      reconfigureAfter401({ server: "http://x", token: "y" }),
    ).rejects.toBeInstanceOf(NonInteractiveAuthError);
  });

  it("throws NonInteractiveAuthError when token comes from env", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    process.env.TRACEABILITY_MANAGEMENT_TOKEN = "env-token";
    await expect(
      reconfigureAfter401({ server: "http://x", token: "env-token" }),
    ).rejects.toBeInstanceOf(NonInteractiveAuthError);
    expect(inquirer.password).not.toHaveBeenCalled();
  });

  it("prompts and persists when TTY and token is from config", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    delete process.env.TRACEABILITY_MANAGEMENT_TOKEN;
    vi.mocked(inquirer.input).mockResolvedValueOnce("https://updated.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("new-token");
    const cfg = await reconfigureAfter401({ server: "https://old.example", token: "old-token" });
    expect(cfg).toEqual({ server: "https://updated.example", token: "new-token" });
    expect(inquirer.input).toHaveBeenCalledWith(
      expect.objectContaining({ default: "https://old.example" }),
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @traceability/cli test -- src/lib/config-interactive.test.ts`
Expected: FAIL(`reconfigureAfter401` 未导出)

- [ ] **Step 3: 实现 `reconfigureAfter401`**

在 `config-interactive.ts` 追加:

```ts
export async function reconfigureAfter401(current: CliConfig): Promise<CliConfig> {
  if (!isInteractive()) {
    throw new NonInteractiveAuthError(
      "management authentication failed and stdin is not a TTY; refusing to prompt",
    );
  }
  const envToken = process.env.TRACEABILITY_MANAGEMENT_TOKEN;
  if (envToken !== undefined && envToken === current.token) {
    throw new NonInteractiveAuthError(
      "TRACEABILITY_MANAGEMENT_TOKEN is set; refusing to prompt (unset the env var to reconfigure)",
    );
  }
  process.stderr.write("Server rejected the management token. Please re-enter your credentials.\n");
  const cfg = await runPrompt({ serverDefault: current.server });
  saveConfig(cfg);
  process.stderr.write(`Saved to ${configPath()}.\n`);
  return cfg;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @traceability/cli test -- src/lib/config-interactive.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/config-interactive.ts packages/cli/src/lib/config-interactive.test.ts
git commit -m "feat(cli): reconfigureAfter401 with env-token safety guard"
```

---

### Task 5: `getTrpcClient()` async 化 + reauthLink

**Files:**
- Modify: `packages/cli/src/lib/trpc.ts`
- Create: `packages/cli/src/lib/trpc.test.ts`

**Interfaces:**
- Consumes: `ensureConfig`, `reconfigureAfter401`, `NonInteractiveAuthError` from `./config-interactive.js`
- Produces:
  - `export async function getTrpcClient(): Promise<TRPCClient<AppRouter>>`
  - `reauthLink` 内部实现(不 export)

**行为:**
- 首次调用 → `await ensureConfig()` 获取 cfg
- 每次 op:
  - 请求携带 `authorization: Bearer ${cfg.token}`(每次都从闭包读)
  - 若结果错误且 `err.data.code === "UNAUTHORIZED"` 或 `err.data.httpStatus === 401`:
    - 已重试过 → 原样抛出
    - 未重试 → `await reconfigureAfter401(cfg)` 更新闭包 cfg → 重发一次 op
- `reconfigureAfter401` 抛 `NonInteractiveAuthError` → 把**原** 401 错误抛出(不是 `NonInteractiveAuthError`)
- 其他错误原样透传

- [ ] **Step 1: 写失败集成测试**

Create `packages/cli/src/lib/trpc.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  password: vi.fn(),
}));

const inquirer = await import("@inquirer/prompts");

describe("getTrpcClient reauthLink", () => {
  let tmp: string;
  let originalFetch: typeof fetch;
  let originalConfigPath: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "traceability-cli-trpc-"));
    originalConfigPath = process.env.TRACEABILITY_CONFIG_PATH;
    process.env.TRACEABILITY_CONFIG_PATH = join(tmp, "config.json");
    delete process.env.TRACEABILITY_MANAGEMENT_TOKEN;
    delete process.env.TRACEABILITY_SERVER_URL;
    writeFileSync(
      process.env.TRACEABILITY_CONFIG_PATH,
      JSON.stringify({ server: "http://mock.example", token: "old-token" }),
    );
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    originalFetch = globalThis.fetch;
    vi.mocked(inquirer.input).mockReset();
    vi.mocked(inquirer.password).mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(tmp, { recursive: true, force: true });
    if (originalConfigPath === undefined) delete process.env.TRACEABILITY_CONFIG_PATH;
    else process.env.TRACEABILITY_CONFIG_PATH = originalConfigPath;
  });

  function trpcResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("retries once after 401 and returns success", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      calls.push(headers?.authorization ?? "");
      if (calls.length === 1) {
        return trpcResponse(
          [{ error: { message: "unauthorized", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } } }],
          401,
        );
      }
      return trpcResponse([{ result: { data: [] } }]);
    }) as unknown as typeof fetch;

    vi.mocked(inquirer.input).mockResolvedValueOnce("http://mock.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("new-token");

    const { getTrpcClient } = await import("./trpc.js");
    const client = await getTrpcClient();
    const result = await client.projects.list.query();

    expect(result).toEqual([]);
    expect(calls).toEqual(["Bearer old-token", "Bearer new-token"]);
    expect(inquirer.password).toHaveBeenCalledTimes(1);
  });

  it("gives up after second 401 and throws UNAUTHORIZED", async () => {
    globalThis.fetch = vi.fn(async () =>
      trpcResponse(
        [{ error: { message: "unauthorized", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } } }],
        401,
      ),
    ) as unknown as typeof fetch;

    vi.mocked(inquirer.input).mockResolvedValueOnce("http://mock.example");
    vi.mocked(inquirer.password).mockResolvedValueOnce("still-bad");

    const { getTrpcClient } = await import("./trpc.js");
    const client = await getTrpcClient();
    await expect(client.projects.list.query()).rejects.toMatchObject({
      data: { code: "UNAUTHORIZED" },
    });
    expect(inquirer.password).toHaveBeenCalledTimes(1);
  });

  it("propagates 401 unchanged in non-TTY", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    globalThis.fetch = vi.fn(async () =>
      trpcResponse(
        [{ error: { message: "unauthorized", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } } }],
        401,
      ),
    ) as unknown as typeof fetch;

    const { getTrpcClient } = await import("./trpc.js");
    const client = await getTrpcClient();
    await expect(client.projects.list.query()).rejects.toMatchObject({
      data: { code: "UNAUTHORIZED" },
    });
    expect(inquirer.password).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @traceability/cli test -- src/lib/trpc.test.ts`
Expected: FAIL(旧的 sync `getTrpcClient` 没有 reauth 行为)

- [ ] **Step 3: 改写 trpc.ts**

Replace `packages/cli/src/lib/trpc.ts` entirely:

```ts
import type { AppRouter } from "@traceability/server/trpc";
import {
  createTRPCClient,
  httpBatchLink,
  TRPCClientError,
  type TRPCClient,
  type TRPCLink,
} from "@trpc/client";
import { observable } from "@trpc/server/observable";

import type { CliConfig } from "./config.js";
import { ensureConfig, NonInteractiveAuthError, reconfigureAfter401 } from "./config-interactive.js";

interface CfgRef {
  current: CliConfig;
}

function isUnauthorized(err: unknown): boolean {
  if (!(err instanceof TRPCClientError)) return false;
  const data = err.data as { code?: string; httpStatus?: number } | undefined;
  return data?.code === "UNAUTHORIZED" || data?.httpStatus === 401;
}

function reauthLink(ref: CfgRef): TRPCLink<AppRouter> {
  return () =>
    ({ op, next }) => {
      return observable((observer) => {
        let retried = false;
        const subscribe = () => {
          const subscription = next(op).subscribe({
            next: (value) => observer.next(value),
            complete: () => observer.complete(),
            error: (err) => {
              if (retried || !isUnauthorized(err)) {
                observer.error(err as TRPCClientError<AppRouter>);
                return;
              }
              retried = true;
              reconfigureAfter401(ref.current)
                .then((cfg) => {
                  ref.current = cfg;
                  subscription.unsubscribe();
                  subscribe();
                })
                .catch((reauthErr) => {
                  if (reauthErr instanceof NonInteractiveAuthError) {
                    observer.error(err as TRPCClientError<AppRouter>);
                  } else {
                    observer.error(reauthErr as TRPCClientError<AppRouter>);
                  }
                });
            },
          });
          return subscription;
        };
        subscribe();
      });
    };
}

export async function getTrpcClient(): Promise<TRPCClient<AppRouter>> {
  const ref: CfgRef = { current: await ensureConfig() };
  return createTRPCClient<AppRouter>({
    links: [
      reauthLink(ref),
      httpBatchLink({
        url: `${ref.current.server.replace(/\/$/, "")}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${ref.current.token}` }),
      }),
    ],
  });
}
```

**关键点:** `httpBatchLink` 的 `url` 在链创建时就固定了。若 401 重试时用户改了 server URL,`url` 不会跟着变;这是有意为之(spec §3 已说明)。`headers` 是每次请求都调用的函数,所以 token 变化天然生效。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @traceability/cli test -- src/lib/trpc.test.ts`
Expected: PASS(3 个用例)

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @traceability/cli typecheck`
Expected: 无错误(此时 project.ts / issue.ts 因还没改会报 async 使用错误 → 期望**报错**,下一 task 解决)

若确实想让 typecheck 立刻通过,可以合并到下一 task 一起 commit。这里选择先 commit `trpc.ts` + 测试,允许 typecheck 短暂红:

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/trpc.ts packages/cli/src/lib/trpc.test.ts
git commit -m "feat(cli): async getTrpcClient with 401 reauth link

Next task updates command call sites to await the client."
```

---

### Task 6: 命令 action 改用 `await getTrpcClient()`

**Files:**
- Modify: `packages/cli/src/commands/project.ts`
- Modify: `packages/cli/src/commands/issue.ts`

**Interfaces:**
- Consumes: `await getTrpcClient(): Promise<TRPCClient<AppRouter>>` from Task 5

- [ ] **Step 1: 修改 `project.ts`**

`packages/cli/src/commands/project.ts` 里 5 处 `getTrpcClient().xxx` 全部替换:

`list` action(21-33 行):

```ts
.action(async (opts) => {
  const client = await getTrpcClient();
  const projects = await client.projects.list.query();
  if (opts.json) {
    printJson(projects);
  } else {
    printTable(projects, [
      { key: "id", label: "ID", width: 36 },
      { key: "slug", label: "SLUG", width: 20 },
      { key: "name", label: "NAME", width: 24 },
      { key: "enabled", label: "ENABLED", width: 8 },
    ]);
  }
});
```

`create` action:

```ts
.action(async (opts) => {
  const client = await getTrpcClient();
  const project = await client.projects.create.mutate({
    slug: opts.slug,
    name: opts.name,
    platform: "javascript",
  });
  if (opts.json) {
    printJson(project);
  } else {
    console.log(`Created project ${project.project.id} (${project.project.slug})`);
  }
});
```

`show`:

```ts
.action(async (projectId) => {
  const client = await getTrpcClient();
  const project = await client.projects.get.query(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  printJson(project);
});
```

`update`:

```ts
.action(async (projectId, opts) => {
  if (!opts.name && opts.enabled === undefined) {
    throw new Error("Provide --name or --enabled.");
  }
  const client = await getTrpcClient();
  const project = await client.projects.update.mutate({
    projectId,
    patch: {
      ...(opts.name ? { name: opts.name } : {}),
      ...(opts.enabled === undefined ? {} : { enabled: opts.enabled === "true" }),
    },
  });
  if (!project) throw new Error(`Project not found: ${projectId}`);
  printJson(project);
});
```

`remove`:

```ts
cmd.command("remove <projectId>").action(async (projectId) => {
  const client = await getTrpcClient();
  const project = await client.projects.remove.mutate(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  console.log(`Removed project ${project.slug}.`);
});
```

- [ ] **Step 2: 修改 `issue.ts`**

`list` action:

```ts
.action(async (opts) => {
  const client = await getTrpcClient();
  const result = await client.issues.list.query({
    projectId: opts.projectId,
    limit: Number(opts.limit),
  });
  if (opts.json) {
    printJson(result);
  } else {
    printTable(result.data, [
      { key: "id", label: "ID", width: 36 },
      { key: "title", label: "TITLE", width: 40 },
      { key: "status", label: "STATUS", width: 12 },
      { key: "eventCount", label: "EVENTS", width: 8 },
    ]);
  }
});
```

`show`:

```ts
.action(async (issueId) => {
  const client = await getTrpcClient();
  const issue = await client.issues.get.query(issueId);
  if (!issue) throw new Error(`Issue not found: ${issueId}`);
  printJson(issue);
});
```

- [ ] **Step 3: 跑 typecheck**

Run: `pnpm --filter @traceability/cli typecheck`
Expected: 无错误

- [ ] **Step 4: 跑全部测试**

Run: `pnpm --filter @traceability/cli test`
Expected: 全部 PASS(包括 project.test.ts、issue.test.ts 现有用例)

如果 `project.test.ts` / `issue.test.ts` 里有 mock `getTrpcClient` 的地方,把 mock 改为返回 `Promise.resolve(mockClient)`。

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/project.ts packages/cli/src/commands/issue.ts
git commit -m "refactor(cli): await async getTrpcClient in project/issue commands"
```

---

### Task 7: 更新命令测试 mock(如需)

**Files:**
- Modify: `packages/cli/src/commands/project.test.ts`
- Modify: `packages/cli/src/commands/issue.test.ts`

- [ ] **Step 1: 检查 mock 现状**

Run: `grep -n "getTrpcClient" packages/cli/src/commands/project.test.ts packages/cli/src/commands/issue.test.ts`

如果没有 mock `getTrpcClient` 直接跳到 Step 3(Task 6 的 Step 4 已经通过就没事)。

- [ ] **Step 2: 更新 mock(如果存在)**

把类似 `vi.mocked(getTrpcClient).mockReturnValue(mockClient)` 改为:
`vi.mocked(getTrpcClient).mockResolvedValue(mockClient)`

或者直接让 mock 工厂返回 Promise:
```ts
vi.mock("../lib/trpc.js", () => ({
  getTrpcClient: vi.fn(async () => mockClient),
}));
```

- [ ] **Step 3: 全部测试**

Run: `pnpm --filter @traceability/cli test`
Expected: PASS

- [ ] **Step 4: Commit(如果 Step 2 有修改)**

```bash
git add packages/cli/src/commands/
git commit -m "test(cli): update command mocks for async getTrpcClient"
```

如果没修改,跳过 commit。

---

### Task 8: `uploadSourcemap()` 走门户 + 401 手动重试

**Files:**
- Modify: `packages/cli/src/lib/upload.ts`

**Interfaces:**
- Consumes: `ensureConfig`, `reconfigureAfter401`, `NonInteractiveAuthError` from `./config-interactive.js`

sourcemap 上传走原生 fetch(multipart),不经过 tRPC,`reauthLink` 覆盖不到,必须显式处理。

- [ ] **Step 1: 改写 upload.ts**

Replace `packages/cli/src/lib/upload.ts` entirely:

```ts
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { CliConfig } from "./config.js";
import { ensureConfig, NonInteractiveAuthError, reconfigureAfter401 } from "./config-interactive.js";

export interface UploadSourcemapInput {
  filePath: string;
  projectSlug: string;
  debugId: string;
}

export interface UploadSourcemapResponse {
  id: string;
  debugId: string;
  sizeBytes: number;
  sha256: string;
  reused: boolean;
}

async function postOnce(
  cfg: CliConfig,
  input: UploadSourcemapInput,
): Promise<Response> {
  const body = await readFile(input.filePath);
  const form = new FormData();
  form.set("projectSlug", input.projectSlug);
  form.set("debugId", input.debugId);
  form.set("fileName", basename(input.filePath));
  form.set(
    "map",
    new Blob([new Uint8Array(body)], { type: "application/json" }),
    basename(input.filePath),
  );

  return fetch(`${cfg.server.replace(/\/$/, "")}/api/sourcemaps/upload`, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
}

/**
 * POST a single `.map` file to the server's multipart upload endpoint.
 * On HTTP 401 we prompt the user to re-enter credentials (TTY only) and retry once.
 */
export async function uploadSourcemap(
  input: UploadSourcemapInput,
): Promise<UploadSourcemapResponse> {
  let cfg = await ensureConfig();
  let response = await postOnce(cfg, input);

  if (response.status === 401) {
    try {
      cfg = await reconfigureAfter401(cfg);
      response = await postOnce(cfg, input);
    } catch (err) {
      if (err instanceof NonInteractiveAuthError) {
        // Fall through to the not-ok branch below with the original 401.
      } else {
        throw err;
      }
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upload failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return (await response.json()) as UploadSourcemapResponse;
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @traceability/cli typecheck`
Expected: 无错误

- [ ] **Step 3: 测试**

Run: `pnpm --filter @traceability/cli test`
Expected: PASS(如果原本没有 upload 单测,则只跑现有用例通过即可)

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/lib/upload.ts
git commit -m "feat(cli): sourcemap upload uses interactive config + 401 retry"
```

---

### Task 9: 顶层 catch 识别 `ExitPromptError` → exit 130

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: 修改 index.ts**

Replace `packages/cli/src/index.ts` 底部的 `parseAsync().catch` 块:

```ts
program.parseAsync(process.argv).catch((err) => {
  if (err instanceof Error && err.name === "ExitPromptError") {
    console.error("Aborted.");
    process.exitCode = 130;
    return;
  }
  console.error(err instanceof Error ? err.message : String(err));
  const code =
    typeof err === "object" &&
    err !== null &&
    "data" in err &&
    typeof err.data === "object" &&
    err.data !== null &&
    "code" in err.data &&
    err.data.code === "UNAUTHORIZED"
      ? 2
      : 1;
  process.exitCode = code;
});
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @traceability/cli typecheck`
Expected: 无错误

- [ ] **Step 3: 测试**

Run: `pnpm --filter @traceability/cli test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): recognize ExitPromptError as SIGINT-equivalent exit 130"
```

---

### Task 10: 手工验证 + README 更新

**Files:**
- Modify: `packages/cli/README.md`(若存在配置章节则更新;否则跳过)

- [ ] **Step 1: 手工验证 4 条清单**

```bash
# 1. 首次配置(无 config)
rm -f ~/.traceability/config.json
cd packages/cli
pnpm dev project list
# 期望: 弹 prompt 两次, 输入完成后打印 "Saved to ..." 并继续列出 projects

# 2. token 失效重进(需要本地 server 起着 + MANAGEMENT_AUTH_TOKEN 与 config 中不一致)
# 先把 config 里 token 改成错的:
node -e "const f='$HOME/.traceability/config.json';const c=JSON.parse(require('fs').readFileSync(f));c.token='wrong';require('fs').writeFileSync(f,JSON.stringify(c,null,2))"
pnpm dev project list
# 期望: 打印 "Server rejected...", 弹 prompt, 输入正确 token, 命令继续

# 3. 非 TTY
echo "" | pnpm dev project list
# 期望: 不弹 prompt, 打印错误 + 引导, exit code 2 (echo $?)

# 4. env token 场景
TRACEABILITY_MANAGEMENT_TOKEN=bad pnpm dev project list
# 期望: 401 不弹 prompt, 报错退出 2
```

- [ ] **Step 2: 更新 README(若有 config 章节)**

Run: `grep -n "config set" packages/cli/README.md 2>/dev/null || echo "no readme section"`

如果有,在相应段落上方追加:

```markdown
### 首次运行

第一次执行需要 server 的命令(如 `traceability project list`)时,CLI 会检测到
本地无配置,并弹出交互式输入框让你填入 server URL 和 management token,填完
后自动保存到 `~/.traceability/config.json` 并继续执行原命令。

如果服务端后续返回 401(比如 token 被轮换),CLI 会再次弹窗让你更新凭据并
透明重试当前请求。非交互式环境(CI 等)不会弹窗,直接以退出码 2 失败并给出
`traceability config set` / `--server` / `--token` / `TRACEABILITY_MANAGEMENT_TOKEN`
的引导。
```

- [ ] **Step 3: Commit README 变更(如果有)**

```bash
git add packages/cli/README.md
git commit -m "docs(cli): document interactive config first-run behaviour"
```

- [ ] **Step 4: 最终 lint / typecheck / test 全绿**

```bash
pnpm --filter @traceability/cli typecheck
pnpm --filter @traceability/cli test
```

Expected: 两条都通过。

---

## Verification

**成功标准(执行完 Task 1-10 后逐项确认):**

- [ ] `pnpm --filter @traceability/cli typecheck` 无错误
- [ ] `pnpm --filter @traceability/cli test` 全绿(至少覆盖 config-interactive + trpc reauth 两组新测试)
- [ ] Task 10 Step 1 的 4 条手工场景全部符合预期
- [ ] `git log --oneline` 每个 task 都有独立 commit,message 是 Conventional Commits 格式

---

## Self-Review 检查

- Spec 各章节 → 计划任务映射:
  - Architecture / Interfaces(§1、§2) → Task 1–5
  - Data Flow(§3) → Task 5 集成测试 + Task 8 upload + Task 10 手工
  - Error Handling → Task 4(NonInteractiveAuthError) + Task 9(ExitPromptError 130)
  - Testing → Task 2/3/4 单测 + Task 5 集成测 + Task 10 手工
  - Files Touched → Task 1(config.ts)、Task 2-4(config-interactive)、Task 5(trpc)、Task 6-7(commands + tests)、Task 8(upload)、Task 9(index)、Task 10(README)
- 无 TBD / TODO 占位符
- 类型一致:`getTrpcClient` 全程 `Promise<TRPCClient<AppRouter>>`,`ensureConfig`/`reconfigureAfter401` 全程 `Promise<CliConfig>`,`NonInteractiveAuthError` 在 Task 2 定义、Task 4/5/8 使用一致
- 覆盖了 spec 未明说但真实存在的 `uploadSourcemap` 原生 fetch 路径(Task 8)
