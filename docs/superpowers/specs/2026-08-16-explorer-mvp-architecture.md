# Traceability Explorer MVP 方案文档（基于当前代码架构）

> 状态：方案基线
> 日期：2026-08-16
> 面向：产品、交互设计、桌面端、服务端、Agent/Tool 研发
> 目标：在不推翻现有 Electron Agent、扩展系统和 Server 模块结构的前提下，落地 AI 驱动的证据图 Explorer。

## 1. 结论摘要

Explorer MVP 应被定义为：

> **以 Project 为边界、由本地 Agent 调查并实时构建、由 Server 持久化和分发的证据图工作区。**

与原讨论中的通用 Web 架构相比，本方案做五项关键调整：

1. **Agent 不迁移到 Server。** 当前 Agent Runtime、Skill、Tool、会话和本地代码访问都在 Electron 主进程，Explorer 继续复用这条链路。
2. **不在 Explorer 内重复建设 Chat。** 当前受保护页面已经处于“内容区 + 全局 Agent Panel”的工作台布局，Explorer 只建设 Graph 工作区，并复用现有 Agent Panel。
3. **Graph 是 Server 数据，Chat 是本地数据。** Graph 需要跨窗口、跨设备和未来多人协作，因此以 PostgreSQL 为事实源；Agent 会话仍由 Electron 本地 JSONL/SQLite 持久化。
4. **WebSocket 只传递实时事件。** Renderer 和 Agent 产生的持久化修改统一进入 Server Graph Mutation Service；事务同时写入 Operation 与 Realtime Outbox，再由 Dispatcher 通过 WebSocket 广播。业务校验不放入 WebSocket Gateway。
5. **本期不增加自动 Context 注入。** 不新增 Main IPC，不做设备级绑定；用户通过 Agent Panel 的 `/explorer-graph-create` Skill 手动提供、确认 Project、Issue 和调查意图。

最终主链路为：

```text
Research Tools / Skills
          │
          ▼
Electron Main Agent Runtime
          │ typed Graph Tools
          ▼
Server Graph Mutation Service ──► PostgreSQL
          │ commit
          ▼
Graph Event Bus ──► WebSocket Gateway ──► Electron Renderer
                                                │
                                                ▼
                                         Explorer Graph Store
                                                │
                                                ▼
                                            React Flow
```

## 2. 已核实的当前项目基线

本方案以当前代码为准，而不是沿用早期文档中的旧架构描述。

| 领域 | 当前实现 | 对 Explorer 的约束 |
| --- | --- | --- |
| Explorer 页面 | `/explorer` 已存在，但仅为 `Coming soon` 占位页 | 在现有路由和工作台中扩展，不新建独立应用壳 |
| 桌面布局 | 受保护页面统一使用 Content / Agent 可缩放双面板，并已有 Content Focus + Floating Agent 模式 | Explorer 复用全局 Agent Panel；Canvas 优先使用 Content Focus |
| Agent Runtime | `AgentPool` / `AgentRuntime` 位于 Electron 主进程 | Graph Agent Tools 必须注册到现有 Main Extension 体系 |
| Agent 事件 | Main 通过 allowlisted IPC 向 Renderer 推送消息和 Tool 状态 | `agent.started/completed/failed` 继续走 IPC，不绕行 Server WebSocket |
| Agent 会话 | Electron 本地 JSONL + SQLite；会话类型已经包含 `projectId` | Explorer 不新增 Graph ↔ Session 的持久绑定；Operation 仅可选记录 `sessionId`，聊天记录仍不迁到 Server |
| Agent Tool 扩展 | Main Extension 支持 system prompt、强类型 Tool 注册和子 Agent | Explorer Graph Tools 可以作为内置扩展接入 |
| Renderer 扩展 | 支持 slash command、assistant block、Streamdown、TipTap 扩展 | 需要新增 Graph Node / Detail Renderer 注册能力 |
| Server API | Fastify + tRPC，按 `modules/<domain>/{schema,repository,service,router}` 组织 | 新增 `explorer` 领域模块，沿用容器注入和 tRPC |
| Server 数据 | PostgreSQL/Drizzle；已有 Redis、BullMQ、MinIO | Graph 用 PostgreSQL；Redis 可承载多实例实时事件分发 |
| Server 实时层 | 当前依赖和运行代码中没有 WebSocket Gateway | WebSocket 是 Explorer 新能力，不应假设已有实现可复用 |
| 鉴权 | Renderer 与 Main 均使用 Bearer JWT 访问 tRPC | WebSocket 需要单独设计安全握手，不能依赖浏览器自定义 Authorization Header |
| React Flow | 当前 `app` 未引入 React Flow / XYFlow | MVP 需要新增 Canvas 依赖和领域模型适配层 |
| Project 选择 | Renderer 已有当前 Project Store 和切换器；Agent Panel 当前没有自动注入该上下文 | `/explorer-graph-create` 需要由用户在 Prompt 中提供或确认 Project |
| Agent Context | 现有 Agent 通过 Skill、Tool 和 AskUserQuestion 工作，没有 Explorer 专用 Main IPC Context | Explorer Graph 参数在 Skill / Tool 参数中显式传递，不新增 IPC |

### 2.1 必须先修正的基线问题

当前 Agent 会话是本地会话，且 Explorer 尚未有专用 Context 绑定；Issue Detail 的 `Investigate` 入口不纳入本期。

Explorer 实施前需要先把这些基线行为收口：

- 本期不增加 Explorer 专用 Main IPC、不改变现有 Agent Session 持久化结构，也不做设备级 Workspace Binding。
- 移除 Issue Detail 的 `Investigate` 入口；Explorer Graph 统一从 Agent Panel 的 `/explorer-graph-create` Skill 主动发起。
- Graph 所需的 Project、Issue、调查目标和证据范围由用户在 Agent Panel 中输入或通过 AskUserQuestion 确认。

## 3. 产品目标与 MVP 边界

### 3.1 产品目标

用户围绕当前 Project 提出问题，Agent 使用 Traceability 数据和本地代码进行调查，并把问题、发现、证据和代码关系逐步沉淀为可恢复的 Graph。

MVP 验证的核心假设是：

> 对异常定位、代码理解和变更原因追溯，证据图是否比单纯的线性聊天更容易理解和复查。

### 3.2 MVP 包含

- 一个 Project 下创建、列出、打开和归档多个 Explorer Graph。
- 从 Explorer 空白页发起调查。
- 从 Agent Panel 的 `/explorer-graph-create` slash command 发起调查。
- Agent 实时创建/更新 Node、创建/删除 Edge。
- 用户查看详情、移动 Node、删除 Node/Edge、重新布局。
- Graph 保存、重新打开和版本恢复。
- WebSocket 实时推送已提交的 Graph Operation，不依赖轮询。
- 记录 Graph 的关键操作、版本和 Actor，为历史、撤销和协作预留基础。
- 断线重连、版本缺口检测和 Snapshot 重同步。

### 3.3 MVP 不包含

- 完整多人在线状态、光标、选择框和共同拖拽。
- CRDT、OT 或复杂冲突合并。
- Graph History、Undo/Redo 的完整 UI。
- Graph Database、Graph Query Language 或 Neo4j。
- Server 端 Agent Runtime。
- Server 端自动布局。
- 外部 Browser、GitHub、Figma、在线文档等尚不存在的连接器。
- Agent 聊天记录的云端同步。
- Issue Detail 到 Explorer 的 `Investigate` 快捷入口和自动导航。
- 通过当前 Project、当前 Issue 或路由参数自动注入 Explorer Context。
- Project 到本地设备源码目录的绑定。

## 4. Explorer 的领域模型

### 4.1 核心对象

```text
Project
  └── Explorer Graph（一次可持续的调查）
        ├── Nodes
        ├── Edges
        └── Operations / Versions

Local Agent Session
  └── 继续由现有 Agent Panel 管理，不与 Graph 做持久绑定
```

### 4.2 Graph 与 Agent Session 的关系

- Graph 是 Server 端长期资产，归属于 Project。
- Agent Session 是当前设备上的本地调查过程，本期不增加 Graph 绑定字段。
- Graph 创建和 Node 操作所需的 `projectId`、`graphId` 由 Skill/Tool 参数显式传递。
- Graph 不依赖某个本地 Session 才能被打开；用户从 Graph Detail 页面或 Agent Panel 继续操作。
- Graph Operation 可记录可选 `sessionId` 用于审计，但 Server 不把本地 Session 当作外键或权限依据。

### 4.3 Graph 数据契约

本期不重复定义与 React Flow 相同的 Node / Edge 结构。Graph 数据契约直接复用 React Flow 的类型：

```ts
import type { Edge, Node, Viewport } from "@xyflow/react";
import type { AppRouterOutputs } from "@tracerability/server/trpc";

type Issue = NonNullable<AppRouterOutputs["issues"]["get"]>;
type Event = AppRouterOutputs["issues"]["events"][number];
type ReplaySummary = AppRouterOutputs["replays"]["list"]["data"][number];

type ExplorerNodeType =
  | "question"
  | "finding"
  | "issue"
  | "event"
  | "replay"
  | "code"
  | "document";

type ExplorerNodeData =
  | QuestionNodeData
  | FindingNodeData
  | IssueNodeData
  | EventNodeData
  | ReplayNodeData
  | CodeNodeData
  | DocumentNodeData;

type QuestionNodeData = { kind: "question"; prompt: string; intent?: string };
type FindingNodeData = { kind: "finding"; summary: string; confidence?: number };
type IssueNodeData = { kind: "issue"; issue: Issue };
type EventNodeData = { kind: "event"; event: Event };
type ReplayNodeData = { kind: "replay"; replay: ReplaySummary };
type CodeNodeData = {
  kind: "code";
  path: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  snippet?: string;
};
type DocumentNodeData = {
  kind: "document";
  title: string;
  path?: string;
  excerpt?: string;
};
type ExplorerEdgeData = { relation: string };

type ExplorerNode = Node<ExplorerNodeData, ExplorerNodeType>;
type ExplorerEdge = Edge<ExplorerEdgeData, "traceability">;

interface ExplorerGraphSnapshot {
  id: string;
  projectId: string;
  title: string;
  status: "active" | "archived";
  version: number;
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
  viewport?: Viewport;
  updatedAt: string;
}
```

`ExplorerNodeData` / `ExplorerEdgeData` 只定义业务数据，不重复定义 React Flow 的位置、端点、选择态、变更类型等结构。业务关系放在 `ExplorerEdgeData.relation`，React Flow 的视觉 Edge `type` 固定为 `traceability`。

Issue、Event、Replay 等来源数据优先复用现有 tRPC 输出类型（例如 `AppRouterOutputs["issues"]["get"]`），不重新复制现有 Server DTO。

### 4.4 Operation 契约

所有持久化修改统一使用 Operation，而不是让 Agent 或 React Flow 直接改数据库：

```ts
interface ApplyGraphOperationsInput {
  operationId: string;
  graphId: string;
  baseVersion: number;
  actor: { type: "user" | "agent"; sessionId?: string };
  operations: GraphOperation[];
}

type GraphOperation =
  | CreateNodeOperation
  | UpdateNodeOperation
  | DeleteNodeOperation
  | MoveNodesOperation
  | CreateEdgeOperation
  | UpdateEdgeOperation
  | DeleteEdgeOperation;
```

规则：

- 一个请求中的多项 Operation 在一个数据库事务内完成。
- `operationId` 用于幂等和前端去重。
- `baseVersion` 用于发现并发修改。
- 成功后 Graph `version + 1`，并产生一条持久化 Operation 记录。
- Node 临时 ID 可以在批量操作中被后续 Edge 引用，Server 返回正式 ID 映射。
- Operation 记录中的 `actorId` 由 Server 从 JWT 用户或内部系统上下文派生，客户端不能自行声明 Actor ID；`system` 只允许 Server 内部操作使用。

## 5. MVP Node 与 Relationship

### 5.1 首期 Node 类型

原讨论中的 Node 类型需要按当前数据能力收缩和重排。

| Node | Canvas 展示重点 | `data` 最小字段 | 创建方式 |
| --- | --- | --- | --- |
| `question` | 本次调查问题和意图 | `prompt`、`intent` | `/explorer-graph-create` 确认后创建 |
| `finding` | Agent 的判断、假设或结论 | `summary`、`confidence`、`status` | Agent Graph Tool 创建/更新 |
| `issue` | Issue 标题、状态、发生次数 | 复用现有 `Issue` tRPC 输出类型或 `issueId` 引用 | `get_issue` 后由 Graph Tool 创建 |
| `event` | Event 标题、时间、异常摘要 | 复用现有 `issues.events` 输出类型或 `eventId` 引用 | Graph Research Tool 创建 |
| `replay` | Replay 标题、时间、入口信息 | 复用现有 `replays.list` 输出类型或 `replayId` 引用 | Graph Research Tool 创建 |
| `code` | 文件路径、行范围、代码摘要 | `path`、`startLine`、`endLine`、`language`、`snippet` | 用户在 Prompt 中提供路径/内容后由只读 Tool 获取 |
| `document` | 文档标题、路径、引用片段 | `title`、`path`、`excerpt` | 用户在 Prompt 中提供路径/内容后由只读 Tool 获取 |

首期不提供 `browser`、`github_pr`、`commit` 等 Node，因为当前 Agent 没有对应数据连接器。未来连接器接入后通过 Registry 扩展。

#### 本期 Node 行为范围

- 所有 Node 均使用 React Flow `Node` 类型渲染，支持选中、拖动、查看详情和删除。
- `question`、`finding`、`issue` 是第一条垂直链路必须打通的 Node。
- `event`、`replay` 需要通过现有 Server API 增加对应的 Main Extension Research Tool，但不需要新增 Main IPC。
- `code`、`document` 只处理用户在 Prompt 中明确提供的路径或内容；本期不做 Project 到设备目录的自动绑定。
- Canvas Card 只显示摘要，完整来源内容放在 Graph Detail 的 Node Detail 面板。
- Node 的 `status`、错误文本和加载占位属于 `data`，不新增另一套 React Flow Node 状态模型。

### 5.2 首期 Relationship

- `investigates`：Question 指向调查对象或 Finding。
- `supports`：证据支持 Finding。
- `contradicts`：证据与 Finding 冲突。
- `caused_by`：问题或现象由某项因素导致。
- `implemented_by`：需求或 Finding 由 Code 实现。
- `observed_in`：Issue/Finding 在 Event 或 Replay 中被观察到。
- `related_to`：尚不能给出更具体关系时的兜底。

关系方向和含义必须固定；Edge Label 只显示简短的本地化文案。

## 6. 各端职责

### 6.1 Electron Renderer

Renderer 是交互和展示层，负责：

- Explorer Graph 列表、空状态、Canvas、Node Card、Node Detail。
- 通过现有 tRPC Client 加载 Snapshot、提交用户 Operation。
- 维护当前 Graph 的 Zustand Store 和临时 UI 状态。
- 建立 WebSocket 连接、订阅当前 Graph、消费已提交 Operation。
- 把领域 Node/Edge 映射为 React Flow 对象。
- 本地自动布局和 Node 新增动画。
- 用户拖拽期间只更新本地状态，在 `drag stop` 时提交位置。
- 用户修改使用乐观更新，并用 `operationId` 与 Server Event 对账。
- 发现版本跳跃、断线重连或事件无法应用时重新拉取 Snapshot。
- 切换 Graph Detail 时清理旧 Graph 订阅，并加载新 Graph Snapshot。
- 通过 Agent Panel 的 slash command 和 Skill Node 提供 Graph 创建入口，不自动向 Agent 注入当前 Project 或 Issue。

Renderer 不负责：

- 运行 Agent 或访问 Node/OS API。
- 校验 Graph 业务规则。
- 把 React Flow 的每次鼠标移动同步到 Server。
- 直接信任 Agent 生成的任意 Node JSON。

### 6.2 Preload

Preload 本期不增加 Explorer 专用 IPC：

- 不新增 Agent Session、Explorer Context 或 Workspace 目录选择 IPC。
- 现有 Agent 事件 IPC、会话 IPC 保持不变。
- Graph Store、WebSocket、Graph API 和 Skill 流程都不经过 Preload。
- 不暴露任意 IPC channel，也不改变 `contextIsolation: true`、`nodeIntegration: false`。

Graph 的普通读写和 WebSocket 连接由 Renderer 直连 Server；Agent Tool 由现有 Main Extension 直连 Server。

### 6.3 Electron Main

Electron Main 是 Agent 和本地能力层，负责：

- 沿用 `AgentPool` / `AgentRuntime` 运行主 Agent 和子 Agent。
- 通过 Main Extension 注册强类型的 Graph Tools。
- Graph Tools 的 `projectId`、`graphId`、Issue ID 和调查范围来自 Agent 对用户 Prompt/AskUserQuestion 的理解与确认，不通过新增 IPC 注入。
- Graph Tools 调用 Server tRPC Mutation，不能直接向 Renderer 推送伪 Graph Event。
- 保留 Research Tools 与 Graph Tools 的边界：前者获取资料，后者表达调查结果。
- Agent 生命周期、消息流和 Tool 执行状态继续通过现有 IPC 发送给 Agent Panel。
- 本地 Agent Session 继续使用现有 JSONL/SQLite 持久化，不增加 Explorer 专用字段。

Electron Main 不负责：

- 保存 Graph 的权威副本。
- 维护 React Flow 坐标系或 UI Selection。
- WebSocket 广播。
- 代替 Server 做 Graph 版本和并发控制。

### 6.4 Server API / Graph Domain

Server 是 Graph 事实源，负责：

- Graph 创建、列表、读取、重命名、归档。
- Node / Edge / Operation 的持久化。
- 批量 Operation 校验、权限检查、幂等、事务和版本控制。
- 校验 Node 类型、Node 数据、Edge 端点和 Relationship。
- 记录 Actor、Session、Operation、版本和时间。
- 事务内写入 Graph Operation 和 Realtime Outbox，由 Dispatcher 可靠发布 Graph Event。
- 提供按版本恢复所需的 Snapshot 或增量 Operation。
- 生成短期 WebSocket Ticket。

Server 不负责：

- 调用 LLM、读取本地仓库或运行 Skills。
- 知道 React Component、React Flow Node Type 或画布视觉状态。
- 计算自动布局。
- 保存 Hover、Selection、Context Menu、Dragging 等临时 UI 状态。

### 6.5 Realtime Gateway

Realtime Gateway 是 Server 的传输层，负责：

- 认证连接。
- 管理 `projectId / graphId` 订阅房间。
- 广播已提交的 `graph.operation.committed`。
- 心跳、断线清理和基本限流。
- 为未来的 `presence.*`、`selection.*`、`cursor.*` 预留消息命名空间。

它不负责执行 Graph Mutation。MVP 中所有持久化 Command 仍走 tRPC；WebSocket 只做事件分发。

#### 6.5.1 WebSocket 鉴权

当前客户端使用 Bearer JWT，而浏览器 WebSocket API 无法像 `fetch` 一样设置 Authorization Header。MVP 采用短期 Ticket：

```text
Renderer ── Bearer JWT ──► realtime.createTicket
Renderer ◄── one-time ticket（短时有效）
Renderer ── ws://.../api/realtime?ticket=... ──► Gateway
```

- Ticket 单次使用、短时有效，并绑定用户。
- 连接建立后仍需显式订阅 Graph；Server 校验该 Graph 是否属于请求 Project。
- 不把长期 access token 放进 WebSocket URL。

#### 6.5.2 Event Bus

Server 已有 Redis。Graph Event Bus 使用独立的 Redis Publish/Subscribe 连接，使同一 Graph 的 HTTP Mutation 和 WebSocket Connection 位于不同 API 实例时仍能收到事件。

当前 Server 已有“事务写 Outbox → Dispatcher claim → Redis/BullMQ → 失败重试”的可靠投递模式。Explorer 沿用该模式：Graph 事务同时写 `explorer_operations` 和 `explorer_event_outbox`，Realtime Dispatcher 再发布 Redis Pub/Sub。这样可避免“数据库已提交，但进程在 publish 前退出”导致当前 Canvas 永久收不到 Agent 修改。

PostgreSQL Operation 记录是持久化事实；Outbox 保证最终尝试投递；Redis 只负责低延迟分发。Dispatcher 或 Redis 可能产生重复投递，因此客户端仍需按 `operationId + graphVersion` 幂等消费。若客户端检测到版本缺口，则重新同步 Snapshot。

## 7. Node Registry 如何贴合现有 Extension 架构

原讨论中的“一个 Registry 同时生成 Tool 和 React Node”不能在当前三进程 Electron 中实现为一个运行时单例。正确做法是：

> **共享一份 Node Definition 契约，在 Main Registry 和 Renderer Registry 中分别注册各自能力。**

```text
Explorer Node Common Definition
        ├── type / label / data schema / tool metadata
        │
        ├── Electron Main
        │     └── 注册 create_xxx_node / update_xxx_node Tool
        │
        └── Renderer
              └── 注册 Node Card / Detail Renderer / default size
```

### 7.1 Main Extension 扩展

新增内置 `explorer` Main Extension：

- 根据 Node Definition 生成参数明确的 Node Tool，例如：
  - `explorer_create_finding_node`
  - `explorer_create_issue_node`
  - `explorer_create_code_node`
  - `explorer_update_finding_node`
- 注册通用 Graph Tool：
  - `explorer_connect_nodes`
  - `explorer_delete_node`
  - `explorer_delete_edge`
- `operationId` 可由 Tool Factory 生成；`projectId`、`graphId`、Issue ID 等业务上下文必须来自用户确认后的 Prompt 或 AskUserQuestion，不由 Main IPC 自动注入。
- Actor 身份由 Server 从当前 JWT 派生，Agent 只声明本次操作是 `agent` provenance。
- 每个 Tool 最终编译为通用 Graph Operation 并调用 Server。

这样既保留不同 Node 的强类型参数，也避免 Server 为每种 Tool 建一套业务入口。

### 7.2 Renderer Extension 扩展

在现有 `RendererExtensionContext` 增加 `graphNodes.register(...)`，Registry 保存：

- Node Type、名称、图标和说明。
- Card Renderer。
- Detail Renderer。
- 数据解析/校验器。
- 默认尺寸和 Handle 定义。
- 可选本地操作菜单。

Explorer Canvas 从 Renderer Extension Registry 取得 Node Renderer，不在页面内维护巨大 `switch`。

### 7.3 Server 的校验边界

Server 不加载 React Renderer 或 Agent Tool。Server 只维护允许的 Node Type、基础数据版本和领域校验规则。

MVP 的内置 Node Type 在 Server Explorer 模块中显式注册。未来开放第三方 Node Extension 时，再设计 Registry Manifest 同步机制；不在本期提前实现动态远程插件协议。

## 8. 各端功能清单

### 8.1 `/explorer-graph-create` Skill 与 Slash Command

#### Slash command 注册方式

本期不新增独立的 Slash Command IPC，也不在 Agent Panel 内复制一套命令系统。当前 Agent Panel 已通过 `SkillService.listSkills()` 获取 Skill，并将其放入现有的 Slash Command Suggestions；选中后由现有 `skillNode` 写入 Prompt 的 `skillIds`。

因此只需要新增项目 Skill：

```text
.agents/skills/explorer-graph-create/SKILL.md
```

其 frontmatter 使用：

```yaml
name: explorer-graph-create
description: Create an Explorer evidence graph after confirming context and intent with the user.
```

用户在 Agent Panel 中输入：

```text
/explorer-graph-create 请帮我创建关于 <issue> 的 graph
```

选择建议项后，Skill Node 会被嵌入当前 Prompt；提交时沿用现有 `skillIds` 和 `expandSkillReferences` 链路。这样 `/explorer-graph-create` 是 Agent Panel 可见的 Skills Slash Command，不需要新增 Main IPC 或新的 Prompt 传输协议。

#### Skill 工作流

Skill 必须严格遵循“先确认、后写入”的顺序。前四步不得调用任何 Graph 创建、Node 创建或 Edge 创建工具。

1. **收集上下文**
   - 解析用户 Prompt 中的 Project、Issue、目标问题和调查范围。
   - 如果 Issue 是自然语言，使用现有 `list_issues` / `get_issue` Tool 进行候选匹配。
   - 如果 Project 不明确，使用现有 `list_projects` Tool 后通过 AskUserQuestion 让用户选择。
   - 不使用当前路由、当前 Project Store 或 Issue Detail 自动注入上下文。

2. **确认上下文和意图**
   - 先用普通 Agent 回复复述识别到的上下文。
   - 再使用 AskUserQuestion 让用户确认：Project、目标 Issue/对象、调查问题、证据范围是否准确。
   - 同时询问用户意图，例如“定位根因”“建立 Issue 到 Code 的关系”“解释某次变更原因”。
   - 用户选择“需要修改”时，回到第 1 步，不创建 Graph。

3. **询问是否创建 Graph**
   - 上下文和意图确认后，使用 AskUserQuestion 询问用户是否需要创建 Exploring Graph。
   - 选项为：`需要创建`、`暂不创建，仅保留分析结果`、`修改上下文`。
   - 用户选择“暂不创建”时，不产生 Graph 数据；选择“修改上下文”时回到第 1 步。

4. **展示 Ask 形式的示例图**
   - 用户选择“需要创建”后，Agent 输出一张只读的 Markdown/Mermaid 预览。
   - 预览仅展示将要创建的内容，不写入 Server，也不占用 Graph Version。
   - 预览后再次使用 AskUserQuestion 提供：`确认创建`、`修改上下文`、`取消`；只有“确认创建”才允许调用 Graph Tool。

示例：

```text
我理解为：
- Project：checkout-web
- 目标 Issue：TypeError: Cannot read properties of undefined
- 调查意图：定位根因，并建立 Issue → Code 的证据关系
- 证据范围：Issue、相关 Event、代码文件

预计创建：

Question: 为什么 checkout-web 的该 Issue 会发生？
       ├── Issue: TypeError...
       └── Finding: 待 Agent 调查
                 └── Code: 待定位
```

用户确认创建后，Agent 才可以调用：

```text
explorer_create_graph(projectId, title)
explorer_create_question_node(projectId, graphId, ...)
explorer_create_issue_node(projectId, graphId, ...)
explorer_connect_nodes(projectId, graphId, ...)
```

每个 Tool 的 `projectId` / `graphId` 都来自已确认的 Prompt 上下文或前一步 Tool Result；Main 不自动注入。

5. **创建完成后的交互**
   - Graph Tools 返回 `graphId`、版本和已创建节点摘要。
   - Explorer Main Extension 将结果附带为现有 Assistant Block 数据。
   - Renderer Assistant Block 展示“Open Explorer Graph”按钮，点击后进入 `/explorer/:graphId` Detail 页面。
   - 不通过新增 IPC 自动导航，也不强制替换用户当前 Agent Session。

#### Skill 的失败和中断规则

- 无法确认 Project 或目标对象时，继续 AskUserQuestion，不创建半成品 Graph。
- 用户取消时，不创建任何 Graph 数据。
- 创建 Graph 成功但后续 Node Tool 失败时，保留已提交 Operation，并在 Agent 回复中明确失败节点；不回滚已提交 Graph。
- Agent 被中止时，不自动执行补偿删除。

### 8.2 Explorer Renderer

#### Graph 导航

- 当前 Project 的 Graph 列表。
- 新建 Graph。
- 打开最近 Graph。
- 点击列表 Item 进入 `/explorer/:graphId` Graph Detail；列表页不展开 Inline Detail。
- 重命名、归档 Graph。
- 显示更新时间和运行状态。

#### Canvas

- 平移、缩放、Fit View。
- 点击、单选和多选 Node。
- 拖动 Node，拖动结束后保存位置。
- 删除 Node / Edge。
- 新 Node 轻量进入动画。
- 自动布局和手动“整理布局”。
- Loading / Ready / Error Node 状态。
- Reconnecting / Out of sync 状态提示。

#### Node Detail

- 根据 Node Type 展示详细内容和 Metadata。
- Finding 展示支持/反对证据。
- Issue/Event 展示 Traceability 原始来源入口。
- Replay 可跳转/打开现有 Replay 能力。
- Code/Document 展示路径、行范围、内容快照和来源版本。
- 支持基于当前 Node 信息继续调查；Graph ID / Node ID 由用户复制后手动写入 Agent Prompt。

#### Agent 协作

- 复用全局 Agent Panel 输入、流式消息、Tool 状态、Steering、Follow-up 和 Human-in-the-loop。
- Graph Detail 页面可以展示当前 Graph ID，用户需要在 Agent Prompt 中明确写出 Graph ID / Node ID 后，Agent 才能继续操作该 Graph。
- Node Detail 提供可复制的 Graph ID、Node ID 和来源摘要，帮助用户手动构造后续 Prompt。

### 8.3 Electron Main / Agent

- Explorer Graph Tools。
- 补齐 Event / Related Replay 研究 Tool，使首期证据 Node 有真实数据来源。
- 当前 Node 上下文解析。
- Tool 参数校验和清晰的 Tool Result。
- Tool 操作失败时向 Agent 返回可恢复错误。
- Agent 中止不回滚已经提交的 Graph Operation。
- 子 Agent 默认可研究数据；是否允许写 Graph 由父任务显式授予，避免并行子 Agent 无控制地修改同一 Graph。

### 8.4 Server

- Graph CRUD 和 Project 过滤。
- Snapshot 查询。
- Batch Operation Mutation。
- Operation Log 和 Graph Version。
- Node/Edge 完整性校验。
- `operationId` 幂等。
- WebSocket Ticket。
- Graph 房间订阅和事件广播。
- 版本缺口后的恢复接口。

## 9. 页面与交互结构

### 9.1 复用当前工作台布局

当前应用已经提供全局 Agent Panel，因此 Explorer 不在内容区重复建设 Chat；同时 Graph List 和 Graph Detail 必须是两个独立页面。

路由和职责为：

```text
/explorer
  └── ExplorerGraphListPage
      只展示当前 Project 的 Graph 列表、创建入口、搜索/筛选和归档状态

/explorer/:graphId
  └── ExplorerGraphDetailPage
      只展示一个 Graph 的 Canvas、Node Detail、版本/连接状态和返回列表入口
```

页面关系：

```text
┌──────────┬───────────────────────────────┬──────────────┐
│ App Nav  │ Graph List 或 Graph Detail    │ Agent Panel  │
│          │                               │              │
│          │ 当前路由只呈现其中一个页面     │ Chat/Status  │
│          │                               │ Prompt       │
└──────────┴───────────────────────────────┴──────────────┘
```

- Graph List 页面不渲染 Canvas 和 Node Detail。
- Graph Detail 页面不固定展示 Graph List；通过返回按钮或面包屑回到 `/explorer`。
- Node Detail 是 Graph Detail 内的侧滑面板/抽屉，服务于当前 Graph，不与 Graph List 混排。
- Explorer Detail 默认优先使用现有 Content Focus + Floating Agent 模式，保证 Canvas 面积；用户仍可恢复 Split View。
- Agent Panel 仍是全局会话组件，不复制消息 Store、Prompt Input 或会话切换器。

### 9.2 设计师需要覆盖的状态

1. Project 下没有 Graph 的 Empty State。
2. 新建 Graph 后仅有 Question Node 的 Investigation State。
3. Agent 连续新增 Node/Edge 的实时状态。
4. 已有 Graph 的恢复加载状态。
5. Node Loading / Ready / Error。
6. Node Detail：Question、Finding、Issue、Event、Replay、Code、Document。
7. WebSocket 断开但 HTTP 可用的 Reconnecting 状态。
8. Version Gap 后重新同步状态。
9. Graph 列表空、正常、归档。
10. Content Focus + Floating Agent 与 Split View 两种宽度。

## 10. 端到端协作流程

### 10.1 从 Explorer 新建调查

```text
User starts from Agent Panel and enters /explorer-graph-create
  → User writes Project and investigation context in the Prompt
  → Skill confirms Project, target, intent and evidence scope
  → Agent calls explorer_create_graph(projectId, title)
  → Agent receives graphId and explicitly passes it to subsequent Node/Edge Tools
  → Assistant Block offers Open Explorer Graph
  → User opens /explorer/:graphId and Renderer subscribes to the Graph WebSocket room
```

### 10.2 Agent 创建 Node / Edge

```text
Agent calls explorer_create_finding_node
  → Main Extension validates the explicit projectId / graphId arguments
  → Tool calls explorer.applyOperations through Main tRPC client
  → Server validates baseVersion and Node schema
  → PostgreSQL transaction commits Node + Operation + Outbox + version
  → Realtime Dispatcher publishes graph.operation.committed
  → WebSocket broadcasts to subscribed Renderer(s)
  → Renderer Graph Store applies Operation
  → React Flow renders the new Node
```

Tool Result 只向 Agent 返回成功、正式 Node ID、Graph Version 和必要摘要；它不负责驱动 UI。

### 10.3 用户移动 Node

```text
onNodeDrag
  → Renderer local state only

onNodeDragStop
  → optimistic MoveNodes Operation
  → Server commit
  → WebSocket echo with same operationId
  → Renderer deduplicates and confirms version
```

### 10.4 用户从 Agent Panel 发起 Graph 创建

```text
User selects /explorer-graph-create in Agent Panel
  → existing skillNode records explorer-graph-create in Prompt metadata
  → Skill resolves Project / Issue / intent through existing Research Tools
  → AskUserQuestion confirms context and intent
  → Agent prints a read-only example graph
  → AskUserQuestion confirms whether to create
  → Agent calls explorer_create_graph(projectId, title)
  → Agent calls typed Node/Edge Tools with explicit projectId + graphId
  → Assistant Block returns an Open Explorer Graph action
  → User opens /explorer/:graphId Detail page
  → Renderer loads Snapshot and subscribes to the Graph WebSocket room
```

该流程不依赖路由、Project Store 或 Issue Detail 的自动 Context 注入，也不需要新增 Main IPC。

### 10.5 断线与恢复

```text
WebSocket disconnected
  → Canvas remains usable; show reconnecting indicator
  → durable writes still use tRPC
  → reconnect and resubscribe with current version
  → Server returns missing Operations or requires Snapshot refresh
  → version continuous: apply incrementally
  → version gap/unrecognized op: fetch full Snapshot
```

## 11. Server 模块建议

### 11.1 Explorer Domain

沿用当前 Server 模块约定：

```text
server/src/modules/explorer/
├── index.ts
├── repository.ts
├── router.ts
├── schema.ts
├── service.ts
└── types.ts
```

职责：

- `router`：tRPC 输入输出和鉴权入口。
- `service`：Graph 规则、Version、Operation、Node Registry 校验。
- `repository`：Drizzle 查询和事务。
- `schema`：Graph、Node、Edge、Operation 表。
- `types`：领域类型和 Operation Contract。

### 11.2 Realtime Domain

```text
server/src/realtime-dispatcher.ts

server/src/modules/realtime/
├── event-bus.ts
├── gateway.ts
├── ticket-service.ts
└── types.ts
```

职责：

- 一次性 Ticket。
- WebSocket 连接与订阅。
- Redis Pub/Sub。
- 心跳和断线清理。
- 顶层 `realtime-dispatcher.ts` 作为独立进程 claim Outbox、发布事件并处理重试，结构上对应现有 ingest `dispatcher.ts`。

### 11.3 建议的 Server 能力面

```text
explorer.listGraphs(projectId)
explorer.createGraph(projectId, title)
explorer.getGraph(graphId)
explorer.renameGraph(graphId, title)
explorer.archiveGraph(graphId)
explorer.applyOperations(input)
explorer.getOperations(graphId, afterVersion)

realtime.createTicket()
WebSocket /api/realtime
```

### 11.4 数据表

```text
explorer_graphs
  id, project_id, title, status, version,
  created_by, created_at, updated_at

explorer_nodes
  id, graph_id, type, status,
  position_x, position_y, data,
  created_at, updated_at

explorer_edges
  id, graph_id, source_node_id, target_node_id,
  source_handle, target_handle, relation, data,
  created_at, updated_at

explorer_operations
  id, operation_id, graph_id, graph_version,
  actor_type, actor_id, session_id, operations,
  created_at

explorer_event_outbox
  id, operation_id, topic, payload, status,
  attempts, available_at, claimed_at, published_at,
  created_at
```

关键约束：

- Graph 必须归属已存在的 Project。
- Node/Edge 删除随 Graph 级联。
- Edge 两端必须属于同一 Graph。
- `(graph_id, operation_id)` 唯一。
- `(graph_id, graph_version)` 唯一。
- Outbox 的 `operation_id` 唯一并引用对应 Operation。
- Operation 内容保留完整批量操作，用于审计和恢复。

## 12. 客户端模块建议

```text
app/src/renderer/pages/(protected)/Explorer/
├── index.tsx                         # Graph List Page
├── detail.tsx                        # Graph Detail Page
├── ExplorerGraphList.tsx
├── ExplorerCanvas.tsx
├── ExplorerNodeDetail.tsx
├── nodes/
└── node-renderers/

app/src/renderer/store/
└── explorer.ts

app/src/renderer/hooks/
├── use-explorer-graph.ts
└── use-explorer-realtime.ts

app/src/renderer/lib/
└── realtime.ts

app/src/extensions/builtins/explorer/
├── common/
│   ├── extension.ts
│   ├── node-definitions.ts
│   └── types.ts
├── main/
│   └── index.ts
└── renderer/
    └── index.tsx

.agents/skills/explorer-graph-create/
└── SKILL.md
```

现有文件需要配合调整：

- Renderer/Main 已安装扩展清单加入 `explorer`；Skill 文件由现有 `SkillService` 自动发现。
- Renderer Extension Registry 增加 Graph Node 注册面。
- 不新增 Agent Session IPC、Explorer Context IPC 或设备绑定。
- 从 `monitor/Issues/detail.tsx` 移除 Issue Detail 的 `Investigate` 按钮、命令和 `promptAgent` 调用；若 `renderer/lib/agent-events.ts` 不再有其他消费者，一并移除该 Explorer 相关事件。
- Router 增加 `/explorer` Graph List 和 `/explorer/:graphId` Graph Detail。
- Server `container`、tRPC `appRouter`、数据库聚合 schema 和 `createApp` 注册新模块。
- `app/package.json` 增加 React Flow / XYFlow 依赖。
- `server/package.json` 增加与 Fastify 版本匹配的 WebSocket 支持。

## 13. 一致性、并发与失败策略

### 13.1 权威数据与临时数据

| 数据 | 权威位置 |
| --- | --- |
| Graph、Node、Edge、Operation、Version | Server PostgreSQL |
| 实时 Graph Event | Redis + WebSocket（非持久事实） |
| 当前 Canvas Store | Renderer 内存缓存 |
| Hover、Selection、Dragging、Drawer | Renderer 本地 UI State |
| Agent Chat / Token / Tool Timeline | Electron 本地会话存储 |
| Agent 运行状态 | Electron Main，通过 IPC 投影到 Renderer |

### 13.2 冲突策略

- MVP 使用 Graph 级 `baseVersion` 乐观并发控制。
- 版本不匹配时 Server 返回当前版本，客户端拉取 Snapshot 后重放仍适用的用户意图。
- Node 最终位置允许“最后一次已提交移动获胜”。
- 删除优先于对同一 Node 的后续更新；更新已删除对象返回明确错误。
- 不在 MVP 中实现 CRDT。

### 13.3 幂等与重复事件

- 客户端和 Tool 在重试时复用相同 `operationId`。
- Server 对重复 `operationId` 返回第一次提交结果。
- Renderer 维护最近已应用 Operation ID，并以 Graph Version 二次校验。
- 本地用户操作收到 WebSocket 回声时只确认，不重复应用。

## 14. 权限与安全边界

- 所有 Graph tRPC Procedure 使用现有用户 JWT 鉴权。
- Graph 每次访问均校验其 `projectId`，不接受客户端只凭 Graph ID 绕过 Project 边界。
- 当前项目尚未建立完整 User/Organization/Project Membership，MVP 不在 Explorer 中单独发明一套成员权限；后续应随全局租户模型统一补齐。
- WebSocket Ticket 短期、单次使用，不在 URL 中暴露长期 JWT。
- Agent Tool 不接受模型传入任意 Actor ID。Project ID / Graph ID 虽由 Agent 根据用户确认的 Prompt 显式传入，但 Server 仍需校验 Project 与 Graph 的归属；Actor ID 由 Server 从 JWT 派生。
- Node `data` 仍需按类型校验，不能因为来源是 Agent 就信任任意 JSON。
- 本地代码/文档 Node 只处理用户在 Prompt 中明确提供的路径、内容或摘要；不得自动读取或上传整个仓库。

## 15. 分阶段实施顺序

### Phase 0：基线收口

- 移除 Issue Detail 的 `Investigate` 入口。
- 新增 `.agents/skills/explorer-graph-create/SKILL.md`，确认 Skill 可被现有 Agent Panel Slash Command Suggestions 发现。
- 定义 Skill 的上下文确认、意图确认、示例图和创建确认流程。
- 明确 Graph Tool 的 `projectId` / `graphId` 必须作为显式参数传递，不新增 Main IPC 或自动 Context 注入。

### Phase 1：Graph 事实源

- Server Explorer Module、数据库表、Graph CRUD、Snapshot。
- Batch Operation、Version、Idempotency、Operation Log。
- Graph Operation 与 Realtime Outbox 在同一事务写入。
- 基础 Node/Relationship 校验。

### Phase 2：Explorer 只读与手动编辑

- `/explorer/:graphId`、Graph List、Canvas、Detail。
- React Flow Node/Edge rendering using the shared third-party types。
- 手动移动、删除、自动布局和持久化恢复。

### Phase 3：Agent Graph Tools

- Explorer Main Extension。
- 补齐 Issue Event / Related Replay 研究 Tool。
- Node-specific typed tools + generic Edge tools。
- Skill 确认后的显式 `projectId` / `graphId` 参数传递，不新增 Session/Graph Context 注入。
- Agent Tool → Server Mutation 端到端链路。

### Phase 4：WebSocket 实时层

- Ticket、Gateway、Graph Room、Redis Event Bus。
- Realtime Dispatcher、Outbox Claim 和失败重试。
- Renderer 订阅、去重、断线重连、Version Gap 恢复。
- Agent Tool 执行时 Canvas 实时增量渲染。

### Phase 5：产品入口与体验完成度

- Agent Panel `/explorer-graph-create` Skill 的确认、预览和创建体验。
- Node Detail 复制 Graph/Node ID 后手动“继续调查”。
- Loading/Error/Disconnected 状态。
- 动画、空状态、窄宽度和 Floating Agent 适配。

## 16. MVP 验收标准

### 功能

- 用户能在 Agent Panel 选择 `/explorer-graph-create`，并在确认上下文和意图后创建 Graph 和 Question Node。
- 用户能在 Graph List 页面查看 Graph，并点击进入独立的 Graph Detail 页面。
- Agent 能使用强类型 Tool 创建 Finding、Issue、Event、Replay、Code、Document Node，并建立关系。
- Agent Tool 在 Server 提交后，当前 Canvas 无需刷新和轮询即可出现变化。
- Graph Mutation 提交成功但 API 进程在广播前退出时，Outbox 仍能让事件被后续 Dispatcher 投递。
- 用户拖动 Node 时不产生高频请求，拖动结束后位置可在重新打开时恢复。
- 用户能删除 Node/Edge，关联 Edge 按规则处理。
- 重新打开应用后，Server Graph 可恢复；Graph 不依赖本地 Agent Session 才能打开。
- 切换 Project 后不会继续显示或修改上一个 Project 的 Graph。
- Graph List 与 Graph Detail 不在同一页面呈现。
- 本期没有 Issue Detail 到 Explorer 的 `Investigate` 入口。

### 一致性与恢复

- 同一 `operationId` 重试不会产生重复 Node/Edge。
- Renderer 不会因 WebSocket 回声重复应用本地乐观操作。
- WebSocket 断开后重新连接能恢复到最新 Graph Version。
- 客户端发现 Version Gap 时能拉取 Snapshot 自愈。
- Operation Log 能区分 User、Agent、System，并记录可选 Session ID。

### 架构

- Graph API / shared contract 复用 React Flow `Node` / `Edge` 类型；不重复定义等价的 Node/Edge 结构。
- React Flow 组件不进入 Server 或 Electron Main。
- Agent 不直接操作 Renderer Store 或 React Flow。
- Graph 持久化修改统一经过 Graph Mutation Service。
- WebSocket Gateway 不承载业务 Mutation。
- Agent 事件继续走 IPC，Graph 事件走 WebSocket，两类事件职责不重复。
- Renderer 不新增 Node/OS 直连能力，Preload 仍保持 allowlist。

## 17. 后续演进

在上述基础稳定后，可按需求增加：

1. Graph History、Undo/Redo 和 Operation Replay。
2. Presence、在线成员、Selection、Cursor。
3. 多人同时拖拽和冲突策略。
4. 需要复杂共同编辑时再引入 CRDT。
5. GitHub、Browser、在线文档、Figma 等连接器和对应 Node Extension。
6. Graph 评论、分享、权限和 Project Membership。
7. 服务端布局或团队统一布局策略。
8. Agent Session 云同步，但不应成为 Graph 可用性的前置条件。

## 18. 最终架构原则

Explorer 的长期可演进性取决于以下边界能否保持稳定：

```text
Research Tool 获取证据
        ≠
Graph Tool 表达证据

Electron Main 运行 Agent
        ≠
Server 保存 Graph

Graph Operation 描述业务修改
        ≠
React Flow Change 描述 UI 交互

WebSocket 分发已提交事件
        ≠
WebSocket 执行业务规则

Server Graph 是共享事实
        ≠
Local Agent Session 是本机调查过程
```

只要这些边界成立，MVP 可以快速落地，后续增加多人协作、更多数据源和更复杂 Node 时也不需要重做核心链路。
