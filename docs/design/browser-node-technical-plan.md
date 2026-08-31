# Browser Node 功能与技术方案

> 状态：方案稿，尚未实现产品代码  
> 日期：2026-08-31  
> 视觉交互稿：[`../prototype/browser-node-detail.html`](../prototype/browser-node-detail.html)

## 1. 结论

Browser Node 应当是一个**持久化的 Graph 业务节点**，而 `WebContentsView` 只是打开 Node Detail 时临时申请的本地运行时资源。Graph 中无论存在多少 Browser Node，都不应长期维持同等数量的网页进程。

MVP 的技术选择如下：

- Browser Node 在 Graph 上只渲染 `preview`，不渲染真实网页。
- Browser Node Detail 使用主进程管理的 `WebContentsView`，不启用 `<webview>`。
- Anchor 高亮、元素选择和 Zap/Projection 直接运行在远端页面自己的 DOM 中；React Renderer 不尝试用 `z-index` 覆盖 `WebContentsView`。
- App 自有的工具栏、Inspector 和确认界面放在 `WebContentsView` 边界之外。必须盖住网页的 App 弹层出现时，先隐藏 native view，再显示 Renderer 弹层；MVP 不引入第二个透明 `WebContentsView`。
- 运行时池默认 `1 active + 2 warm`，其余 Node 为 `dormant`。
- Cookie、登录态和缓存按 Browser Profile / provider 使用持久 partition 共享；Graph 和 Server 永远不保存 Cookie。
- Anchor 与 Projection 规则保存在 Browser Node 的 Graph JSONB 中；Edge 另外保存 `sourceAnchorId` / `targetAnchorId`，React Flow Handle 继续只承担拓扑连线。
- Server MVP 不新增 `browser_nodes`、`anchors`、`projection_rules` 表，但需要扩展 Graph 类型、Zod 校验、Graph Operation 和 Explorer Tool 合约。

## 2. 已验证的当前基线

### Traceability

- Graph Node 数据当前保存在 `graph_nodes.data` JSONB 中，Edge 已有 `graph_edges.data` JSONB、`sourceHandle` 和 `targetHandle`。
- Graph mutation 已有 version、operation id、outbox 和实时同步，不需要另起一套 Browser Node 持久化链路。
- Node 类型当前为 `question | finding | issue | event | replay | code | document`，还没有 `browser`。
- Explorer Node Detail 当前是一个 96vw × 92vh 的大模态：顶部类型色、56px header、主内容区和 320px Inspector 硬分栏、深色边框和 hard shadow。
- Electron 版本为 39.2.x；`BrowserWindow` 尚未启用 `webviewTag`，符合本方案。

### divisor-agent Browser 扩展

现有实现是 renderer-owned `<webview>`，主进程通过 `webContents.fromId()` 接管 guest。它包含 native selection、XPath range、preload IPC、MutationObserver 恢复高亮、持久 partition、permission deny、popup policy、截图和 accessibility snapshot 等能力。

该实现的目标是“独立 Browser Artifact”，而 Browser Node 的目标是“Graph 中某个来源的可恢复证据视图”，生命周期和持久化边界不同，不能整体搬迁。

## 3. 产品边界

### 3.1 MVP 必须支持

1. **来源呈现**
   - 打开 Feishu 文档、Confluence 页面和普通 HTTP(S) 网页。
   - 显示 provider、标题、canonical URL、同步状态和 runtime 状态。
   - 不提供 tab、地址栏、前进、后退或自由输入 URL。

2. **Anchor**
   - 用户选择文本或指定元素，创建带 label 的 Anchor。
   - Anchor 可跳转、聚焦和高亮。
   - Anchor 使用多 locator fallback，不把 Provider DOM 细节泄漏到 Edge。
   - Anchor 可被 Graph Edge 引用；点击关系时打开对应 Node Detail 并聚焦 Anchor。
   - Anchor 失效时显示 `stale`，允许重新定位或删除。

3. **Projection / Zap**
   - 进入“隐藏元素”模式，点击侧栏、评论区、广告等无关区域创建 hide rule。
   - 规则立即保存到当前 Browser Node，而不是按 URL 全局保存。
   - 支持启用/禁用、临时查看隐藏内容、撤销刚才的隐藏、重置 Node 规则。
   - 规则解析失败时显示 `unresolved/stale`，不能静默失败。

4. **可恢复状态**
   - 再次打开时恢复 Anchor、Projection、focused anchor 和滚动位置。
   - Graph 卡片使用持久化 preview；真实网页被销毁后卡片仍可用。
   - 页面更新后重新 resolve Locator，并更新 last resolution。

5. **资源与会话**
   - 最多一个可见 active runtime，最多两个 warm runtime，LRU 淘汰。
   - 同一 profile/provider 共享持久 Electron Session。
   - Detail 关闭后 Node 数据保留，runtime 可被复用或销毁。

6. **安全与失败态**
   - remote content：`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`。
   - 默认拒绝摄像头、麦克风、地理位置和通知等权限。
   - popup 拒绝；页面链接不在 Browser Node 内部形成浏览历史。
   - 支持 loading、登录态失效、页面加载失败、locator stale 和 navigation blocked 提示。

### 3.2 明确不做

- Browser tab、多页签、地址栏、前进/后退、书签、下载中心。
- 在 Graph 卡片中运行真实网页。
- 持久化修改后的 HTML、DOM snapshot 或 CSS class 名单作为唯一定位方式。
- 把每个 Anchor 映射为 React Flow Handle。
- Server 代理网页、托管 Cookie 或执行远端页面脚本。
- MVP 内做多人同时编辑同一个 Anchor/Projection 数组的 CRDT。

## 4. 数据结构

```ts
export type BrowserProvider = "generic-web" | "feishu-doc" | "confluence";

export interface BrowserNodeData {
  kind: "browser";
  schemaVersion: 1;
  source: BrowserSource;
  preview: BrowserPreview;
  anchors: BrowserAnchor[];
  projection: BrowserProjection;
  viewState?: BrowserViewState;
}

export interface BrowserSource {
  provider: BrowserProvider;
  url: string;
  canonicalUrl: string;
  title: string;
  siteName?: string;
  documentId?: string;
  profileId: string;
}

export interface BrowserPreview {
  title: string;
  excerpt?: string;
  faviconUrl?: string;
  capturedAt?: string;
  contentHash?: string;
  snapshotObjectKey?: string;
}

export interface BrowserAnchor {
  id: string;
  label: string;
  quote?: string;
  locators: BrowserLocator[];
  createdBy: "user" | "agent";
  createdAt: string;
  updatedAt: string;
  lastResolution?: BrowserResolution;
}

export type BrowserLocator =
  | { type: "feishu-block"; documentId: string; blockId: string }
  | { type: "confluence-content"; pageId: string; localId?: string }
  | { type: "provider-element"; provider: BrowserProvider; role: string }
  | { type: "text-quote"; exact: string; prefix?: string; suffix?: string }
  | { type: "heading-path"; headings: string[]; occurrence?: number }
  | { type: "text-position"; start: number; end: number; contentHash?: string }
  | { type: "dom-path"; xpath: string; startOffset?: number; endOffset?: number }
  | { type: "css-selector"; selector: string };

export interface BrowserProjection {
  providerPresetVersion?: string;
  rules: ProjectionRule[];
}

export interface ProjectionRule {
  id: string;
  operation: "hide" | "collapse" | "focus";
  target: { locators: BrowserLocator[] };
  enabled: boolean;
  origin: "user" | "agent" | "provider-preset";
  createdAt: string;
  updatedAt: string;
  lastResolution?: BrowserResolution;
}

export interface BrowserResolution {
  state: "resolved" | "unresolved" | "stale";
  locatorType?: BrowserLocator["type"];
  checkedAt: string;
  reason?: string;
}

export interface BrowserViewState {
  focusedAnchorId?: string;
  scrollAnchorId?: string;
  scrollTop?: number;
  lastOpenedAt?: string;
}
```

### 4.1 Locator 解析顺序

Provider Adapter 决定优先级，不要求所有 Provider 使用同一定位方式：

- Feishu：`feishu-block → text-quote → heading-path → dom-path`
- Confluence：`confluence-content → heading-path → text-quote → dom-path`
- Generic Web：`provider-element/css-selector → text-quote → heading-path → text-position → dom-path`

创建 Anchor 时应尽量同时保存 2–4 个 locator。`dom-path` 和 `css-selector` 是最后 fallback，不应成为唯一定位方式。

### 4.2 Edge 数据

```ts
export interface GraphEdgeData {
  relation: GraphRelationship;
  sourceAnchorId?: string;
  targetAnchorId?: string;
}
```

`sourceHandle` / `targetHandle` 继续存 React Flow 的物理 Handle，例如 `node-out` / `node-in`。Anchor ID 进入 `edge.data`，避免将业务语义绑定到 React Flow。

## 5. Server 是否需要扩展

| 层 | MVP 决策 | 原因 |
| --- | --- | --- |
| 数据表 | 不新增表、不做 migration | `graph_nodes.data` 与 `graph_edges.data` 已是 JSONB，能承载 Browser Node 与 Anchor refs |
| Graph 类型/Zod | 需要扩展 | 新增 `browser` discriminated union、locator/rule 长度约束和 URL 校验 |
| Graph Operation | 需要扩展 | `createEdge` / `updateEdge` 需要传递 anchor refs；Browser Node 更新需要全量替换嵌套数组或专用 operation |
| Explorer Agent Tools | 需要扩展 | 新增 create/update Browser Node、create/delete Anchor、create/toggle Projection Rule 的工具契约 |
| Object Storage | 可选 | 只有持久化页面截图时才存 MinIO object key；MVP 可只保存 title/excerpt |
| Browser Runtime | 不放 Server | 网页加载、session、cookie、WebContentsView 和 DOM 注入都属于 Electron 本地能力 |

### 5.1 MVP 更新策略

现有 `updateNode` 是浅 merge。`anchors` 与 `projection` 是嵌套数组，客户端局部 patch 容易覆盖并发修改。建议两种方案按阶段选择：

1. **MVP**：每次 mutation 发送完整 `anchors` 或完整 `projection`，沿用 graph baseVersion 冲突检测；冲突后 reload snapshot 再重试。
2. **后续**：新增语义 operation：`createAnchor`、`updateAnchor`、`deleteAnchor`、`createProjectionRule`、`updateProjectionRule`、`deleteProjectionRule`。这仍可以写入同一个 JSONB，但能减少数组级覆盖和审计噪声。

服务端边界还要限制：Anchor quote、prefix/suffix、note、selector 和规则总数，避免把整页正文或恶意大 payload 写入 Graph。

## 6. Electron 技术方案

### 6.1 View 分层

```text
BrowserWindow.contentView
├── host renderer WebContents                  # Graph + Modal shell + Inspector
└── Browser Runtime WebContentsView            # 只覆盖 detail 的 page viewport 矩形
    └── remote page DOM
        ├── provider page
        ├── injected anchor highlight
        ├── injected selection toolbar
        └── injected zap picker / masks
```

关键规则：

- Renderer 通过 `ResizeObserver` 计算 page viewport 的 `getBoundingClientRect()`，把 DIP bounds 发给主进程。
- 主进程在 modal open transition 完成后挂载并 `setBounds()`；modal 关闭前立即 `setVisible(false)` / detach，避免 native view 压住退出动画。
- 顶部工具条和右侧 Inspector 永远不与 `WebContentsView` 重叠。
- App confirmation、tooltip 或 command menu 如果必须覆盖 remote page，先隐藏 native view。页面内部的 Anchor/Zap 浮层由 guest preload 直接渲染。
- MVP 不创建第二个 overlay `WebContentsView`；它会引入透明渲染、输入穿透、焦点与坐标同步成本。

### 6.2 Runtime Manager

```ts
class BrowserRuntimeManager {
  maxActive = 1;
  maxWarm = 2;

  acquire(node: BrowserNodeData): Promise<BrowserRuntime>;
  attach(nodeId: string, bounds: Rectangle): void;
  updateBounds(nodeId: string, bounds: Rectangle): void;
  release(nodeId: string, viewState: BrowserViewState): void;
  destroy(nodeId: string): void;
}
```

状态：

- `dormant`：没有 WebContents，只保留 Graph 数据。
- `loading`：已申请 runtime，尚未完成 provider ready/restore。
- `active`：挂载且可见，最多一个。
- `warm`：从 contentView detach 或 invisible，仍保留 WebContents，LRU 最多两个。
- `destroyed`：显式 `webContents.close()`；不能只 remove view，否则会泄漏。

打开流程：

```text
open detail → acquire runtime → attach + loadURL → provider ready
→ resolve/apply projection → restore anchors → focus anchor/scroll → active
```

关闭流程：

```text
persist latest viewState → hide/detach view → release to warm
→ LRU overflow 时 close webContents → dormant
```

### 6.3 Session 与权限

- partition 命名以 profile 为主，而不是 node：`persist:traceability-browser-<profileId>`。
- 同一 profile 下的 Feishu / Confluence Browser Node 共享 cookie 与 cache。
- remote view 使用独立 preload bundle；通过窄 IPC 协议发送 selection、anchor resolution、projection status 和 viewport state。
- `setPermissionRequestHandler` / `setPermissionCheckHandler` 默认拒绝；未来按 provider 白名单开放 clipboard 等能力。
- `setWindowOpenHandler` 默认 deny。
- 无导航 UI。主框架导航由 Provider Adapter 的 source-lock policy 控制：允许登录重定向和当前文档必要的 SPA 路由，其他用户点击链接转交系统浏览器或提示“此 Node 锁定到原始来源”。

### 6.4 Provider Adapter

```ts
interface BrowserProviderAdapter {
  provider: BrowserProvider;
  matches(url: URL): boolean;
  canonicalize(url: URL): BrowserSource;
  isAllowedNavigation(from: URL, to: URL, phase: "bootstrap" | "locked"): boolean;
  createLocators(input: SelectionOrElement): BrowserLocator[];
  resolve(locators: BrowserLocator[]): ResolvedAnchor | null;
  extractPreview(): Promise<BrowserPreview>;
  providerPreset(): ProjectionRule[];
}
```

Provider preset 与 Node-specific rule 合并顺序：

```text
remote source → provider preset → node hide/collapse rules → node focus → anchors
```

Provider preset 建议随 App 版本发布并带 version；Node 只保存自己的 rules 和必要 override，避免每个 Node 复制相同的 Feishu sidebar 规则。

### 6.5 高亮与 Zap 注入

- 文字高亮优先使用 CSS Custom Highlight API，避免像 divisor-agent 那样拆分 text node 并包 `<span>` 破坏动态编辑器 DOM；不支持时再降级为 span wrapper。
- native `Selection/Range` 只用于创建时采样，持久化时转为多 locator。
- `MutationObserver` 只做节流后的重新 resolve，不在每次 mutation 上同步扫描整页。
- Zap picker 使用固定定位的 page-local overlay，`pointer-events` 只在选择模式打开；Escape 取消，点击后生成 locator + hide rule。
- 不保存隐藏后的 HTML；保存“隐藏谁”的 declarative rule。

## 7. divisor-agent 可借鉴清单

### 直接借鉴或改造

- `browser-annotation-bridge.js` 的 native selection 监听、Range 序列化和 IPC 事件形状。
- MutationObserver 后的高亮恢复思想，但改成节流的 resolver 和 CSS Highlight 优先。
- persistent partition、Profile 抽象和“同一 profile 共享 session”。
- permission request/check 默认拒绝。
- `setWindowOpenHandler` 拒绝 popup。
- atomic local write 可作为离线 mutation queue 的实现参考，但不能成为业务真值。
- 截图 / accessibility snapshot 服务可在后续 Agent 读取网页内容时拆出复用。

### 不照搬

- `<webview>` factory、registry、`registerGuest(webContentsId)`：Browser Node 直接由主进程创建 `WebContentsView`。
- 按 URL 本地保存 ReadingAnnotation：同一个 URL 的不同 Browser Node 可以有完全不同的追溯视角，必须按 nodeId 存入 Graph。
- XPath + offset 作为唯一定位：对 Feishu / Confluence 虚拟 DOM 太脆弱。
- `findTextRange()` 的全页首次命中 fallback：相同句子会误定位，必须带 prefix/suffix、heading path 和 occurrence。
- 无条件移除 query/hash 的 URL sanitize：部分 provider 用它们标识文档或 block，必须 provider-aware canonicalize。
- tab/profile/navigation UI：Browser Node 明确不需要导航。

## 8. 建议文件结构

```text
app/src/extensions/builtins/browser-node/
├── common/
│   ├── extension.ts
│   ├── ipc.ts
│   └── types.ts
├── main/
│   ├── browser-runtime-manager.ts
│   ├── browser-runtime.ts
│   ├── navigation-policy.ts
│   ├── provider-registry.ts
│   └── providers/
│       ├── generic-web.ts
│       ├── feishu-doc.ts
│       └── confluence.ts
├── preload/
│   ├── index.ts
│   ├── anchor-runtime.ts
│   └── projection-runtime.ts
├── renderer/
│   ├── BrowserNodeDetailContent.tsx
│   ├── BrowserNodeToolbar.tsx
│   ├── BrowserNodeInspector.tsx
│   └── use-browser-surface.ts
├── main.ts
└── renderer.tsx

server/src/modules/graphs/types.ts                 # browser node + anchor refs
app/src/extensions/builtins/explorer/main/index.ts # browser tools
app/src/renderer/pages/(protected)/Explorer/detail/
├── _components/ExplorerGraphNodeCard.tsx          # browser preview
└── _components/ExplorerGraphNodeDetail.tsx        # route browser detail content
```

Electron Vite 需要为 browser guest preload 增加独立 CJS input，不能复用 host renderer preload。

## 9. 实施顺序

1. 扩展 server Graph types/Zod、Edge anchor refs 和集成测试。
2. 增加 Browser Node Agent tools 与 Graph card preview；此阶段还不加载网页。
3. 实现 BrowserRuntimeManager、session/profile 与 Detail bounds IPC。
4. 实现 Generic Web Adapter 和 source-lock navigation policy。
5. 实现 Anchor native selection、multi-locator、restore/focus/stale UI。
6. 实现 Zap picker、Projection rules、临时 reveal 与 reset。
7. 增加 Feishu / Confluence Adapter 和 provider presets。
8. 压测 50–500 个 Browser Node 的 Graph 卡片、1 active + 2 warm runtime 的内存与关闭回收。

## 10. 验收标准

- Graph 中 100 个 Browser Node 不创建 100 个 WebContents；未打开时全部是普通 React Node。
- 打开 Detail 后 active WebContentsView 数量为 1；切换四个 Node 后 warm 数量不超过 2，淘汰项的 webContents 已 close。
- 同一 profile 的两个 Feishu Node 无需重复登录，不同 profile 隔离。
- 创建 Anchor 后刷新、关闭 Detail、重启 App 都能恢复并定位；失败时显示 stale。
- 创建 Zap 后关闭并重开仍有效；规则可禁用、恢复和重置。
- Edge 能表达 `NodeA.anchorX → NodeB.anchorY`，但 React Flow 仍只使用节点级 Handle。
- remote page 无 Node integration，权限默认拒绝，popup 被拦截，Cookie 不进入 Graph/Server。
- Browser Node Detail 视觉结构与当前 Code Node Detail 保持一致，并且无地址栏、前进/后退和 tab。
