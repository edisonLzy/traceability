# 迁移 divisor-agent 的 main / preload / shared 到 traceability

## 目标与范围

把 `/Users/evan/Desktop/coding/divisor-agent/packages/app/src` 下的 `main`、`preload`、`shared` 迁移到当前项目 `app/src` 对应目录,结构与 divisor-agent 保持一致;未迁移功能的引用从代码中干净移除。

**迁移**:

- `main/`:5 个功能目录(`human-in-the-loop`、`prompt`、`skills`、`models`、`tools`)+ Agent 运行时胶水(`agent-ipc.ts`、`agent-pool.ts`、`agent-runtime.ts`、`index.ts`、`env.d.ts`)。
- `shared/`:7 个契约文件(`agent-message`、`ask-user-question-ipc`、`events-ipc`、`models-ipc`、`permissions-ipc`、`session-ipc`、`skills-ipc`)。
- `preload/`:`index.ts` + `index.d.ts`,暴露 **`window.electronAPI`**(与 divisor 一致;renderer 后续适配)。

**不迁移**(并从代码中移除其引用):`extensions/`、`app-updater.ts`、`browser-window/`、`file-system/`、`stt/`,以及对应 shared 文件 `app-update-ipc.ts`、`file-system-ipc.ts`、`system-ipc.ts`、`stt-adapter.ts`。所有 `@divisor-agent/*` 包依赖不引入。

**不做**:不改 renderer(约束);不跑 typecheck/build(input:先不验证)。

## 依赖现状(已确认,无需改 package.json)

所需运行时依赖均已在 `app/package.json`:`@earendil-works/pi-agent-core@0.74.0`、`@earendil-works/pi-ai@0.74.0`、`emittery`、`uuid`、`@tiptap/core`。当前 `app/src/main/` 为空,`preload/index.ts`、`preload/index.d.ts` 为空,`shared/` 仅有 `CLAUDE.md`。

## 约定遵守(来自 CLAUDE.md / shared·preload CLAUDE.md)

- main 与 preload 用相对导入 + `.js` 后缀 + `import type`;renderer 用 `@shared` 别名(本次不改 renderer)。
- `shared/` 不依赖 main/renderer;只含可移植契约 + 小型字面量 allowlist。
- 遵循 `tsconfig.node.json` 已 include `src/main|preload|shared/**/*.ts`。

## 逐文件改动明细

### main/(13 文件)

1. **`human-in-the-loop/abstract-human-in-the-loop.ts`** — 原样复制(仅依赖 `emittery`、`uuid`)。
2. **`human-in-the-loop/ask-user-question-service.ts`** — 复制,改 1 处 import:`@divisor-agent/extension-core/common` 的 `AskUserQuestionInput/Result` → `../../shared/ask-user-question-ipc.js`(类型内联见 shared#2)。
3. **`human-in-the-loop/permission-service.ts`** — 原样复制(依赖 `../../shared/permissions-ipc.js`,已迁移)。
4. **`models/index.ts`、`models/registry.ts`** — 原样复制(依赖 `@earendil-works/pi-ai`、`../../shared/models-ipc.js`)。
5. **`prompt/index.ts`、`prompt/system-prompt-service.ts`** — 原样复制(无外部依赖)。
6. **`skills/index.ts`、`skills/skill-service.ts`** — 原样复制(依赖 `../../shared/skills-ipc.js`、`../prompt/index.js`)。
7. **`tools/index.ts`、`tools/types.ts`、`tools/fs-tool.ts`、`tools/terminal-tool.ts`** — 原样复制(依赖 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`)。
8. **`agent-ipc.ts`** — 原样复制(仅依赖 `electron`,无 @divisor-agent / extensions 依赖)。
9. **`agent-pool.ts`** — 复制并移除 extensions:
   - 删 import `ExtensionService`、`ExtensionRuntimeService`;删字段 `extensionService`、`extensionRuntimeService`。
   - 构造函数删两者的 new、`extensionRuntimeService.onAny(...)`、`extensionService = new ExtensionService(...)`。
   - `createRuntime`:`new AgentRuntime(this.modelRegistry, this.skillService, this.extensionService)` → 去掉第 3 参。
   - `destroyAll`:删 `this.extensionRuntimeService.destroyAll()`、`this.extensionService.dispose()`。
   - `abortPrompt`:runtime 不存在时原调用 `extensionRuntimeService.abortAgent(sessionId)`,改为直接 `return`(无 runtime 无可 abort 对象)。
10. **`agent-runtime.ts`** — 复制并移除 extensions:
    - 删 import `ExtensionService`、`ExtensionAgentModel`、`ExtensionAgentToolOptions`。
    - `AgentRuntimeOptions` 去掉 `extensionTools`,仅保留 `systemPrompt?`。
    - 构造函数去掉 `private extensionService: ExtensionService` 形参,删 `this.systemPromptService.addBuilder(this.extensionService)`。
    - `createInternalAgent`:`tools` 由 `[...(extensionTools?[]:builtinTools), ...extensionService.getToolsForRuntime(...)]` 改为 `builtinTools`(保留 fs 读/写、terminal 三个内置工具);删 `excludedToolNames`/`extensionTools` 判定;删 `getToolsForRuntime({...})` 调用及其中 `getModel`/`getSessionId`/`askUserQuestion` 回调。
    - 删随之成为死代码的 private `getCurrentModel()`(仅被已删的 getToolsForRuntime 回调使用)。
    - `askUserQuestion`、`sessionId`、`setSessionId` 等 HIL 相关逻辑保留不变。
11. **`index.ts`** — 简化为 `AgentPool` + `createWindow`:
    - 移除 `AppUpdateManager`、`BrowserWindowManager`、`FileSystemManager`、`registerDeepgramAuth` 的 import 与实例化。
    - 移除 `app.enableSandbox()`、`webviewTag: true`、Deepgram 麦克风 `setPermissionCheckHandler`/`setPermissionRequestHandler`(均为 extension-browser / STT 服务)。
    - `activate` 只 `agentPool.updateBrowserWindow(...)`;`quit` 只 `agentPool.destroyAll()`。
    - `createWindow` 保留 divisor 的窗口外观(frame/titleBarStyle/vibrancy/尺寸);`icon` 引用 `../../resources/icon.png` **移除**(当前项目无 `resources/` 目录,避免引用缺失);`title` 与 `console.log` 文本改为 Traceability。
12. **`env.d.ts`** — 保留 `/// <reference types="electron-vite/node" />`,删 `VITE_DEEPGRAM_API_KEY`(STT 专用)。

### shared/(7 文件)

1. **`agent-message.ts`** — 原样(依赖 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`@tiptap/core`、`./models-ipc`)。
2. **`ask-user-question-ipc.ts`** — 把 `@divisor-agent/extension-core/common` 的 `AskUserQuestionOption`/`AskUserQuestion`/`AskUserQuestionInput`/`AskUserQuestionAnswer`/`AskUserQuestionResult` **内联**到本文件顶部(源自 `extension-core/src/common/human-in-the-loop.ts`),删 @divisor-agent import;保留 `AskUserQuestionRequest`/`AskUserQuestionRequestedEvent`/`AskUserQuestionResolution` 既有定义。
3. **`events-ipc.ts`** — 移除未迁移契约:
   - 删 import `AppUpdateEvent/AppUpdateIPC`(app-update-ipc)、`FileSystemIPC`(file-system-ipc)、`SystemIPC`(system-ipc)。
   - `AgentRuntimeEvent` 联合去 `AppUpdateEvent`。
   - `AgentRuntimeIPC` 去 `FileSystemIPC & SystemIPC & AppUpdateIPC`。
   - `ALLOWED_MAIN_EXPOSE_EVENTS` 去 `"app_update"`。
   - `ALLOWED_RENDER_INVOKE_EVENTS` 去 `fsReadTextFile`、`isWindowFullScreen`、`setWindowControlsTheme`、`getUpdateState`、`checkForUpdates`、`startUpdate`、`installUpdate`。
4. **`models-ipc.ts`** — 原样。
5. **`permissions-ipc.ts`** — 原样。
6. **`session-ipc.ts`** — 原样。
7. **`skills-ipc.ts`** — 原样。

### preload/(2 文件)

1. **`index.ts`** — 基于 divisor,通过 `contextBridge.exposeInMainWorld("electronAPI", { platform, invoke, on })` 暴露;invoke/on 经 `ALLOWED_RENDER_INVOKE_EVENTS`/`ALLOWED_MAIN_EXPOSE_EVENTS` 校验;**移除** `ExtensionsPreloadAPI` import 与 `extensionsAPI` 暴露。
2. **`index.d.ts`** — 声明全局 `window.electronAPI: ElectronAPI`(`platform`/`invoke`/`on`,类型取自 `../shared/events-ipc.js`);**移除** `extensionsAPI` 与 `api` 声明及 `ExtensionIPCTransport` import。

## 产出目录结构

```
app/src/main/
├── agent-ipc.ts
├── agent-pool.ts          (移除 extensions)
├── agent-runtime.ts       (移除 extensions)
├── index.ts               (仅 AgentPool + 窗口)
├── env.d.ts
├── human-in-the-loop/     abstract-human-in-the-loop.ts · ask-user-question-service.ts · permission-service.ts
├── models/                index.ts · registry.ts
├── prompt/                index.ts · system-prompt-service.ts
├── skills/                index.ts · skill-service.ts
└── tools/                 index.ts · types.ts · fs-tool.ts · terminal-tool.ts

app/src/shared/
├── agent-message.ts
├── ask-user-question-ipc.ts   (内联 AskUserQuestion 类型)
├── events-ipc.ts              (移除 app-update/fs/system)
├── models-ipc.ts
├── permissions-ipc.ts
├── session-ipc.ts
└── skills-ipc.ts

app/src/preload/
├── index.ts       (window.electronAPI)
└── index.d.ts     (window.electronAPI 声明)
```

## 验收对照

1. 目录结构与 divisor-agent 一致(仅缺未迁移的 extensions/app-updater/browser-window/file-system/stt)。✓
2. 未迁移功能的引用在 main/shared/preload 中干净移除,无悬空 import 或断裂调用(agent-pool/agent-runtime/events-ipc/preload 均已逐处处理)。✓
3. main、preload、shared 均含迁移后正确代码。✓

## 已知后续工作(不在本次范围)

- renderer 现用 `window.traceability`,需后续适配为 `window.electronAPI`(用户明确后续处理)。
- `index.ts` 的 `icon` 暂缺(无 resources),可后续补图标资源。
- 本次不跑 typecheck/build,内部引用一致性由上述逐文件改动保证;renderer 侧因仍引用 `window.traceability` 暂会类型不一致,属预期。
