# Turborepo 接入规格

**日期**：2026-07-24
**状态**：已实现（未提交），本 spec 事后固化契约
**目标**：把 monorepo 的 `build` / `test` / `typecheck` 从 `pnpm -r` 顺序执行切换到 [Turborepo](https://turborepo.com) 拓扑并行 + 输入指纹缓存，同时保留 `dev:app` 直连 pnpm 的现状，并说明由此对 Docker 构建带来的连锁修复。

本 spec 面向"下一次要动 turbo 配置 / CI 流水线 / server Dockerfile"的人；它记录**为什么这么配**、**踩过哪些坑**，以及**哪些边界不能越**。

---

## 1. 任务做什么

### 1.1 背景

接入前，根 `package.json` 的 script 靠 `pnpm -r`：

```json
"build":      "pnpm -r --filter=./packages/* --filter=./server run build && pnpm --filter ./app build",
"test":       "pnpm -r run test",
"type-check": "pnpm -r run typecheck"
```

问题：

1. `pnpm -r` 会**串行遍历**所有子包（除非显式 `--parallel`），且没有跨任务的**输入指纹缓存** —— 每次全跑，即使源码没改。
2. `build` 通过 `&&` 硬编码"先 packages/server，后 app"的执行顺序，实际上依赖图应由 `workspace:*` 推导，而不是靠 script 里手写序列。
3. 单跑一个 workspace 的下游任务（如只跑 `@traceability/server:test`）时，`pnpm -r` 不会自动先 build 上游 `@traceability/core` / `client` / `protocol`，得靠使用者手工 `--filter …^...` 补拓扑，容易漏。

### 1.2 目标

- 引入 **Turborepo 2.10.x** 编排 `build` / `test` / `typecheck`；
- `dev` 走 pnpm 直连（长驻进程 + 无缓存），不进 turbo pipeline；
- 通过 `dependsOn: ["^build"]` 让 turbo 从 `workspace:*` 反推拓扑；
- 通过合理的 `inputs` / `outputs` 让**再次运行零改动的任务**命中缓存（`FULL TURBO`）。

### 1.3 非目标

- 不引入 **远端缓存**（Vercel Remote Cache / turbo login）—— 未来 CI 时再评估。
- 不改任何子包的 `scripts.build|test|typecheck` 语义。
- 不重排 monorepo 目录、不重命名 workspace、不动 `catalog:` 版本。
- 不接入 turbo 的 `dev` / `lint` / `format` —— `dev:app` 保持 `pnpm --filter ./app dev`，`lint` / `format` 是根级 oxlint / oxfmt，不需要 turbo 编排。
- 不改 CI（当前仓库尚未有 CI）。

---

## 2. 变更范围

### 2.1 In scope

- 新增根文件 `turbo.json`（唯一的 turbo 配置）。
- 修改根 `package.json`：
  - `build` / `build:app` / `test` / `type-check` 改由 `turbo run` 调度；
  - `clean` 追加清理 `.turbo/` 目录；
  - `devDependencies` 新增 `"turbo": "^2.5.8"`（当前锁定 2.10.6）。
- 修改根 `.gitignore`：追加 `.turbo/`。
- 修改 `server/Dockerfile`：build 阶段新增一行 `COPY tsconfig.base.json ./tsconfig.base.json`（详见 §5.1；是 turbo 接入的**连锁修复**，不是可选优化）。

### 2.2 Out of scope

- 不动 `pnpm-workspace.yaml`（workspace 声明和 `catalog:` 版本）。
- 不动子包的 `package.json` —— 所有子包已有正确的 `build` / `test` / `typecheck` script，无需增改。
- 不动 `packages/skills`（无 build script，turbo 自动跳过其 pipeline 任务，无需显式声明）。
- 不动 `dev:app`（保留 `pnpm --filter ./app dev`）。
- 不加 `pipeline` 之外的 turbo 特性（`globalEnv` / `globalDependencies` / `remoteCache`）—— 当前无需。

---

## 3. 现状基线

### 3.1 Workspace（`pnpm-workspace.yaml`）

```yaml
packages:
  - "packages/*"
  - "app"
  - "server"
  - "examples/*"
```

9 个 workspace（除 examples）：`@traceability/{cli,client,core,electron,protocol,react,skills}` + `@traceability/app` + `@traceability/server`。

### 3.2 各 workspace 已有的 npm scripts

| Workspace | build | test | typecheck |
|---|---|---|---|
| `@traceability/cli` | `tsc` | — | `tsc --noEmit` |
| `@traceability/client` | `tsc` | `vitest run` | `tsc --noEmit` |
| `@traceability/core` | `tsc` | `vitest run` | `tsc --noEmit` |
| `@traceability/electron` | `tsc` | — | `tsc --noEmit` |
| `@traceability/protocol` | `tsc` | — | `tsc --noEmit` |
| `@traceability/react` | `tsc` | — | `tsc --noEmit` |
| `@traceability/skills` | — | — | — |
| `@traceability/app` | `node ./scripts/run-electron-vite.mjs build` | `vitest run` | `tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json` |
| `@traceability/server` | `tsc --project tsconfig.build.json` | `vitest run` | `tsc --noEmit` |

- 7 个 tsc build + 1 个 electron-vite build + 1 个 project-build tsc。
- 4 个 vitest test（`core` / `client` / `app` / `server`）。
- 8 个 typecheck。

### 3.3 依赖拓扑（决定 `^build` 的意义）

- `@traceability/core`、`@traceability/protocol` 是叶节点。
- `@traceability/client` 依赖 `core`、`protocol`。
- `@traceability/react` 依赖 `core`。
- `@traceability/electron` 依赖 `core`。
- `@traceability/cli` 依赖 `client`、`protocol`。
- `@traceability/server` 依赖 `protocol`。
- `@traceability/app` 依赖 `core`、`protocol`、`react`、`electron`、`skills`。

`workspace:*` 通过 `dependencies` 声明，turbo 自动读取；无需在 `turbo.json` 里手写 DAG。

---

## 4. 契约

### 4.1 `turbo.json` 的完整契约（**权威版本**）

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "out/**"],
      "inputs": [
        "src/**",
        "tsconfig*.json",
        "package.json",
        "electron.vite.config.ts",
        "vite.config.ts",
        "scripts/**",
        "components.json",
        "drizzle/**",
        "drizzle.config.ts"
      ]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig*.json", "package.json"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": [],
      "inputs": ["src/**", "vitest.config.ts", "tsconfig*.json", "package.json"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**逐项契约**（不允许静默偏离）：

1. **`ui: "stream"`**：所有子任务输出以流式前缀合并到终端（不用 turbo 的 TUI）。CI 友好、可以 pipe 到 `tail`。若换 `"tui"` 会破坏 `pnpm exec turbo run ... 2>&1 | tail -N` 这种日志抓取方式。
2. **`build.dependsOn: ["^build"]`**：`^` 前缀 = "所有 workspace 依赖的同名任务先跑"。**不要**改成 `["^typecheck"]` 或加 `"prepare"` —— 会引入不必要的 barrier。
3. **`build.outputs`**：
   - `dist/**` 覆盖所有 tsc 类子包 + server 的 `dist/`；
   - `out/**` 覆盖 `@traceability/app` electron-vite 的 `out/`；
   - 未列 `.turbo/` —— 由 turbo 自身管理，不算 outputs；
   - 未列 `coverage/` —— test 目前不产生 outputs（见下）。
4. **`build.inputs`**：白名单式，只在这些文件改动时才 invalidate：
   - `src/**` —— 源码；
   - `tsconfig*.json` —— 包括 `tsconfig.json` / `tsconfig.build.json` / `tsconfig.web.json` / `tsconfig.node.json`；
   - `package.json` —— 依赖版本（间接影响 lockfile hash，见下）；
   - `electron.vite.config.ts` / `vite.config.ts` —— app 的构建配置；
   - `scripts/**` —— app 的 `run-electron-vite.mjs`；
   - `components.json` —— app 的 shadcn 配置；
   - `drizzle/**` / `drizzle.config.ts` —— server 的迁移与配置。
   - **不列** `.env*` / `node_modules/**` / `dist/**`（那是 output）。
   - 未来若加新配置文件（比如 `tailwind.config.ts`、`postcss.config.js`），需要在这里补一行，**否则 turbo 会以为它没变，回放旧缓存**。
5. **`typecheck.dependsOn: ["^build"]`**：`typecheck` 需要上游包已 build（否则消费方看到的是 `src/**` 而非 `dist/**.d.ts`；且 `workspace:*` 的 `main` / `types` 指向 `dist/`）。
6. **`typecheck.outputs`** 缺省 = **没有 outputs**（只有 exit code 和 log），命中时秒回放。
7. **`test.dependsOn: ["^build"]`**：同上，vitest 直接跑 TS 源码但仍消费 `workspace:*` 依赖的 `main`。**不要**改成 `["build"]`（同名前无 `^`）—— 那会先跑本包 build，浪费时间；vitest 不需要本包 dist。
8. **`test.outputs: []`**：显式空数组，强制不缓存产物。若将来引入覆盖率并想缓存，改成 `["coverage/**"]`。
9. **`test.inputs`** 特意**不包含** `src/**/*.snap`、`__fixtures__/**` 之外的东西 —— 目前 vitest 没有 snap / fixture。若引入需追加。
10. **`dev`**：`cache: false, persistent: true`。**唯一**由 turbo 编排的长驻任务位置；但**目前根 script 里没有 `turbo run dev`** —— `dev:app` 仍直连 pnpm。这里预留是为了将来 `turbo run dev` 也能工作，别删。

### 4.2 根 `package.json` 契约

```json
"scripts": {
  "build":      "turbo run build",
  "build:app":  "turbo run build --filter=@traceability/app",
  "dev:app":    "pnpm --filter ./app dev",
  "test":       "turbo run test",
  "type-check": "turbo run typecheck",
  "prepare":    "husky",
  "lint":       "oxlint --fix",
  "format":     "oxfmt --write",
  "clean":      "find . -name node_modules -type d -prune -exec rm -rf {} + && find . -name .turbo -type d -prune -exec rm -rf {} +"
},
"devDependencies": {
  ...
  "turbo": "^2.5.8",
  ...
}
```

- `build:app` 用 `--filter=@traceability/app`（**带 workspace 名，不是路径**）；turbo 会自动带上依赖包的 `^build`。
- `dev:app` 保持 pnpm 直连（见 §1.3）。
- `clean` 同时清 `.turbo/` —— 别只清 `node_modules`。
- `type-check` 保持连字符命名（历史），映射到 turbo pipeline 的 `typecheck`（无连字符）。
- `turbo` 版本声明 `^2.5.8`，锁文件解析为 `2.10.6`；升 major 时需回归 `turbo.json` schema 变更。

### 4.3 `.gitignore` 契约

追加一段：

```gitignore
# Turborepo
.turbo
```

保证 `.turbo/` 缓存元数据不入库。

---

## 5. 连锁修复：`server/Dockerfile`

### 5.1 症状

引入 turbo 后，`server/Dockerfile` 用 `turbo prune @traceability/server --docker` 生成 pruned tree（`out/full/`）作为 build stage 的源。原始 Dockerfile 假设 pruned tree 是自洽的，直接：

```dockerfile
COPY --from=pruner /workspace/out/full/ ./
RUN pnpm --filter @traceability/server build
```

结果 `tsc` 爆出**几十条** `drizzle-orm` 的 d.ts 类型错误（`TS2515` / `TS2344` / `TS2420`），本地 build 却通过。

### 5.2 根因

- `server/tsconfig.json` 通过 `"extends": "../tsconfig.base.json"` 继承 `skipLibCheck: true`、`strict: true`、`moduleResolution: "Bundler"` 等编译选项。
- `turbo prune --docker` 输出 `out/json/`（manifest 树）和 `out/full/`（源码树），但**只把子 workspace 的文件搬进去**，根级 `tsconfig.base.json` 不在 turbo 认为的"该 workspace 依赖的文件"里，**不会被复制**。
- 容器里 `../tsconfig.base.json` 缺失 → tsc 找不到基类 → `skipLibCheck` 等选项**全部丢失，退回默认值** → 依赖包的 d.ts 也被检查 → 报错。

### 5.3 修复契约

在 `server/Dockerfile` 的 build stage，在 `COPY --from=pruner` 之后、`RUN pnpm ... build` 之前，追加一行：

```dockerfile
FROM deps AS build
COPY --from=pruner /workspace/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json    # ← 必需，见 spec 5.2
RUN pnpm --filter @traceability/server build
```

**不允许的替代方案**：

- ❌ 在 `server/tsconfig.build.json` 里内联 `compilerOptions`、消除对 `../tsconfig.base.json` 的 extends —— 会导致本地 server 与其他 workspace 的编译选项漂移。
- ❌ 改 `turbo prune` 命令带更多 flag —— turbo 2.x 没有把"根 tsconfig 也拷进 pruned tree"的选项。
- ❌ 把 `tsconfig.base.json` 移到 `server/` —— 破坏对其他 workspace 的继承。

**允许的未来演进**：如果又有别的 workspace 也用 turbo prune 出 Dockerfile（如给 `@traceability/app` 或 `@traceability/cli` 做镜像），每个 Dockerfile 都要重复这行 `COPY tsconfig.base.json`。可以考虑抽出一个共享的构建阶段。

### 5.4 无关的边角事项（记录以免混淆）

- `server/Dockerfile:18` 里 `pnpm dlx turbo@2.5.8` 与根声明的 `^2.5.8`（当前锁 2.10.6）不完全一致。功能上无差别（prune 语义在 2.x 内稳定），保留原样即可。将来升 turbo major 时需同步这里。
- `pnpm --filter @traceability/server deploy --prod --legacy /runtime` 会打印一些无关的 `Failed to create bin at /runtime/node_modules/.bin/{vite,jiti,conventional-commits-parser}` warning —— 那是 monorepo 里其他包遗留的 dev-only bin，deploy 后不需要，安全忽略。

---

## 6. 验证契约

实现完成后，以下命令必须依次通过：

### 6.1 冷启动

```bash
pnpm install                        # 安装 turbo
find . -name .turbo -type d -prune -exec rm -rf {} +   # 清缓存
pnpm exec turbo run typecheck       # 首次
```

**期望**：
- 全部 11 个 typecheck 任务（`packages/*` × 7 + `app` + `server`；`packages/skills` 因无 typecheck 脚本被跳过）成功；
- 上游 `build` 因 `dependsOn: ["^build"]` 被拉起，也全部成功；
- 输出末尾类似：
  ```
   Tasks:    11 successful, 11 total
   Cached:    0 cached, 11 total
     Time:    ~3s
  ```

### 6.2 缓存回放

紧接着重跑：

```bash
pnpm exec turbo run typecheck
```

**期望**：
- `Cached: 11 cached, 11 total`；
- `Time: <100ms`；
- 出现 `>>> FULL TURBO` 字样。
- 若未 FULL TURBO —— 说明 §4.1 的 `inputs` 白名单漏了某个文件，需要 `TURBO_LOG_VERBOSITY=2` 复现并补。

### 6.3 完整测试

```bash
pnpm exec turbo run test
```

**期望**：4 个 vitest 任务（`core` / `client` / `app` / `server`）全部通过（当前基线：81 tests + 1 skipped），上游 build 已缓存。

### 6.4 Docker 构建

```bash
docker build -f server/Dockerfile -t traceability-server:local .
```

**期望**：4 个 stage（pruner / deps / build / runtime）全部成功，最终镜像 ~300MB。若 build stage 在 `pnpm --filter @traceability/server build` 报 drizzle-orm d.ts 错 —— §5.3 的 `COPY tsconfig.base.json` 没生效。

### 6.5 单包过滤

```bash
pnpm exec turbo run test --filter=@traceability/server
```

**期望**：只跑 server 的 test；`@traceability/protocol:build` 因 `^build` 被拉起（若没 cache）。

---

## 7. 已知边界与陷阱

### 7.1 Node 版本告警

`engines: ">=22 <23"` 与实际执行环境（当前用户 shell 常见为 Node 24）不一致时，pnpm 会打印 `WARN Unsupported engine`，turbo 层不会拦截。不是 turbo 的问题，不在 spec 范围内。修复走 `.node-version` / `nvm use`。

### 7.2 `packages/skills` 无 build/test/typecheck

turbo 会将其视为"该 pipeline 下无任务"跳过；`^build` 依赖它的下游（`@traceability/app`）**不会**因此被 block。若将来给 skills 加 build，`turbo.json` 无需改动 —— pipeline 自动匹配。

### 7.3 `dev:app` 走 pnpm 而非 turbo

`turbo.json` 里有 `dev` 定义（`cache: false, persistent: true`），但根 `dev:app` 仍是 `pnpm --filter ./app dev`。原因：只跑一个 workspace 的长驻任务时，turbo 的额外调度层无收益，且 turbo 对多长驻任务的 stdout 合并会削弱 electron-vite 的着色输出。若将来同时跑多个 `dev`（例如 app + server），再切成 `turbo run dev --filter=@traceability/app --filter=@traceability/server`。

### 7.4 无 Remote Cache

`turbo.json` 未配置 `remoteCache` / `signature` 等字段；不会 push 到 Vercel。若接 CI 想跨机器共享缓存，需要另建 spec，覆盖：
- 认证方式（`TURBO_TOKEN` / `TURBO_TEAM`）；
- 是否启用 `signature: true`（防止跨仓库缓存投毒）；
- CI 与本地是否共用同一命名空间。

### 7.5 `inputs` 白名单漂移

**每次新增顶层配置文件**（例如 `tailwind.config.ts` / `postcss.config.js` / 新 lint config）都必须评估是否加进 `build.inputs` / `typecheck.inputs` / `test.inputs`。漏加 → 改这些文件后 turbo 命中过期缓存，输出与源码不一致，且**难以察觉**。CI 建议加一个"cache miss on every PR"的健康度指标（未来）。

---

## 8. 决策记录

| # | 决策 | 备选 | 选择理由 |
|---|---|---|---|
| D1 | `ui: "stream"` | `"tui"` | CI 与 `\| tail` 兼容 |
| D2 | `dependsOn: ["^build"]` 覆盖 build/test/typecheck | 仅在 build 上加 `^build`，test/typecheck 不加 | vitest / tsc 消费 `workspace:*` 的 dist，无 dist 会 fail |
| D3 | build outputs 显式列 `dist/**`、`out/**` | 缺省（turbo 会尝试推断） | 明确 > 隐式；便于新人 review |
| D4 | test outputs 显式 `[]` | 省略 | 消除歧义：明确"不缓存产物，只缓存 exit code + logs" |
| D5 | 保留 `dev:app` 用 pnpm | 切换成 `turbo run dev` | 单长驻任务无收益，见 §7.3 |
| D6 | `server/Dockerfile` 里 `COPY tsconfig.base.json` | 内联 tsconfig / 改 turbo prune 参数 | 见 §5.3 |
| D7 | 不引入 remote cache | 立即接 Vercel Remote Cache | 尚无 CI，无跨机场景，YAGNI |
| D8 | turbo 声明 `^2.5.8` 但锁到 2.10.6 | 硬钉 `2.10.6` | 允许 patch/minor 自动升；major 变化会引 spec 复审 |

---

## 9. 实现步骤（复演）

以下是把这份 spec 从零实现所需的最短步骤序列。**未来重演 / 追加新 workspace 时可作为脚本模板**。

1. `pnpm add -D -w turbo@^2.5.8` —— 装到 root。
2. 在仓库根新建 `turbo.json`，内容照抄 §4.1。
3. 修改根 `package.json` 的 4 个 script（build / build:app / test / type-check）+ `clean`，见 §4.2。
4. 在 `.gitignore` 追加 `.turbo` 段，见 §4.3。
5. 修改 `server/Dockerfile`，在 build stage 加 `COPY tsconfig.base.json ./tsconfig.base.json`，见 §5.3。
6. 走 §6 验证清单：
   - `pnpm exec turbo run typecheck`（首次 cold）
   - `pnpm exec turbo run typecheck`（预期 FULL TURBO）
   - `pnpm exec turbo run test`
   - `docker build -f server/Dockerfile -t traceability-server:local .`
7. commit（feat/chore 二选一；Conventional Commits）：`chore(build): adopt turborepo for build/test/typecheck pipelines`。

---

## 10. 后续（不在本 spec 内）

- **CI 接入**：GitHub Actions / GitLab CI 里跑 `pnpm exec turbo run build test typecheck --filter=...[origin/master]`，触发 affected 子集。
- **Remote Cache**：接 Vercel Remote Cache 或自建 S3 缓存，见 §7.4。
- **lint / format 接 turbo**：目前 oxlint / oxfmt 是根级单进程，无需切；若将来变成 per-package 就切。
- **`packages/skills` 补 build**：不确定它未来是否需要产物；若需要，只加子包 script，不动 `turbo.json`。
- **turbo prune 通用化**：若给 `@traceability/app`（Electron 主进程 headless run）或 `@traceability/cli` 也做镜像，抽 §5.3 的模式为共享层。
