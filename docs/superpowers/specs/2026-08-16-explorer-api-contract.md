# Explorer 前端接口契约（Server ↔ Renderer / Main）

> 状态：并行开发契约（对应 `2026-08-16-explorer-mvp-architecture.md`）
> 日期：2026-08-16
> Server 实现完成后，前端可改用 `import type { AppRouter, AppRouterOutputs, AppRouterInputs } from "@tracerability/server/trpc"` 直接复用这些类型；在 Server 完成前，先按本文本地定义同构类型。

## 0. 传输层

- 持久化读写 → **tRPC** `POST {server}/api/trpc`，Bearer JWT（沿用 `app/src/renderer/lib/trpc.ts`）。
- 实时事件 → **WebSocket** `GET {server}/api/realtime?ticket=<ticket>`。

## 1. 共享类型

```ts
export type GraphNodeType =
  | "question" | "finding" | "issue" | "event" | "replay" | "code" | "document";

export type GraphRelationship =
  | "investigates" | "supports" | "contradicts" | "caused_by"
  | "implemented_by" | "observed_in" | "related_to";

export type FindingStatus = "open" | "confirmed" | "rejected";

export type QuestionNodeData = { kind: "question"; prompt: string; intent?: string };
export type FindingNodeData = { kind: "finding"; summary: string; confidence?: number; status?: FindingStatus };
export type IssueNodeData = { kind: "issue"; issueId: string };
export type EventNodeData = { kind: "event"; eventId: string };
export type ReplayNodeData = { kind: "replay"; replayId: string };
export type CodeNodeData = { kind: "code"; path: string; startLine?: number; endLine?: number; language?: string; snippet?: string };
export type DocumentNodeData = { kind: "document"; title: string; path?: string; excerpt?: string };

export type GraphNodeData =
  | QuestionNodeData | FindingNodeData | IssueNodeData | EventNodeData
  | ReplayNodeData | CodeNodeData | DocumentNodeData;

export type GraphEdgeData = { relation: GraphRelationship };

// 线格式（与 React Flow 的 Node/Edge 结构兼容）
export type GraphNode = {
  id: string;
  type: GraphNodeType;
  position: { x: number; y: number };
  data: GraphNodeData;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data: GraphEdgeData;
};

export type GraphStatus = "active" | "archived";

export type GraphSummary = {
  id: string; projectId: string; title: string;
  status: GraphStatus; version: number;
  createdAt: string; updatedAt: string;      // ISO 字符串
};

export type GraphSnapshot = {
  id: string; projectId: string; title: string;
  status: GraphStatus; version: number;
  nodes: GraphNode[]; edges: GraphEdge[];
  updatedAt: string;
};
```

## 2. Operation 契约

```ts
export type GraphActor = { type: "user" | "agent"; sessionId?: string };

export type GraphOperation =
  | { op: "createNode"; id: string; type: GraphNodeType; position: { x: number; y: number }; data: GraphNodeData }
  | { op: "updateNode"; id: string; data?: Partial<GraphNodeData>; position?: { x: number; y: number } }
  | { op: "deleteNode"; id: string }
  | { op: "moveNodes"; positions: Array<{ id: string; position: { x: number; y: number } }> }
  | { op: "createEdge"; id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; relation: GraphRelationship }
  | { op: "updateEdge"; id: string; relation?: GraphRelationship }
  | { op: "deleteEdge"; id: string };

export type ApplyGraphOperationsInput = {
  operationId: string;   // 幂等键，重试复用同一值
  graphId: string;
  baseVersion: number;   // 客户端已确认的 graph.version
  actor: GraphActor;
  operations: GraphOperation[];
};

export type ApplyGraphOperationsResult = {
  graphId: string;
  version: number;                    // 应用后的 graph.version
  alreadyApplied: boolean;            // true = 该 operationId 已提交过（幂等命中）
  idMappings: Record<string, string>; // 临时 nodeId → 正式 nodeId（仅首次应用时非空）
  applied: Array<{ op: string; id: string; nodeId?: string; edgeId?: string }>;
};

export type GraphOperationRecord = {
  id: string; operationId: string; graphId: string; graphVersion: number;
  actorType: "user" | "agent" | "system"; actorId: string; sessionId?: string | null;
  operations: GraphOperation[]; createdAt: string;
};
```

## 3. tRPC 过程（均需 JWT）

| 过程 | 类型 | 输入 | 输出 |
| --- | --- | --- | --- |
| `graphs.list` | query | `{ projectId: string }` | `GraphSummary[]` |
| `graphs.create` | mutation | `{ projectId: string; title: string }` | `GraphSummary` |
| `graphs.get` | query | `{ projectId: string; graphId: string }` | `GraphSnapshot \| null` |
| `graphs.rename` | mutation | `{ projectId: string; graphId: string; title: string }` | `GraphSummary` |
| `graphs.archive` | mutation | `{ projectId: string; graphId: string }` | `GraphSummary` |
| `graphs.getOperations` | query | `{ projectId: string; graphId: string; afterVersion: number }` | `GraphOperationRecord[]` |
| `graphs.applyOperations` | mutation | `{ projectId: string } & ApplyGraphOperationsInput` | `ApplyGraphOperationsResult` |
| `realtime.createTicket` | mutation | （无） | `{ ticket: string; expiresIn: number }` |

## 4. WebSocket 协议

```text
连接前: 调 realtime.createTicket 拿 ticket（单次使用、短时有效 ~60s）
连接:   ws://{server}/api/realtime?ticket=<ticket>
认证失败/票过期/已用 → 服务端 close(1008)
```

Client → Server 消息（JSON 文本帧）：

```ts
{ type: "subscribe"; projectId: string; graphId: string }   // 校验 graph 归属后入 room
{ type: "unsubscribe"; graphId: string }
{ type: "pong" }                                            // 响应心跳
```

Server → Client 消息：

```ts
{ type: "subscribed"; graphId: string }                     // subscribe 成功 ack
{ type: "error"; code: string; message: string }            // 订阅校验失败等
{ type: "graph.operation.committed"; graphId: string; graphVersion: number; operationId: string; operations: GraphOperation[] }
{ type: "ping" }                                            // 心跳；客户端回 {"type":"pong"}
```

## 5. 错误与并发语义（前端必须遵守）

- 401 `UNAUTHORIZED`：JWT 缺失/无效。
- `NOT_FOUND`：graph 不存在或不属于该 project。
- `CONFLICT`：`baseVersion` 落后 → 前端 `graphs.get` 拉快照后重放未完成意图。
- 非法 node type / relation / 端点 → zod `BAD_REQUEST`。
- **幂等**：重试复用同一 `operationId`，Server 返回 `alreadyApplied: true`，不重复写。
- **临时 ID**：批量里 `createNode.id` 用客户端临时 id，后续 `createEdge.source/target` 可引用它；Server 用 `idMappings` 返回正式 id（`alreadyApplied:true` 时为空，客户端已有首次响应）。
- **WS 对账**：收到与自己乐观操作相同 `operationId` 的事件只确认、不重复应用；若 `graphVersion` 跳跃（> 本地+1）则 `graphs.get` 重同步。
