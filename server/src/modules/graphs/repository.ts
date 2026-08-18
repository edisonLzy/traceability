import { and, asc, desc, eq, gt, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { graphEdges, graphEventOutbox, graphs, graphNodes, graphOperations } from "./schema.js";
import type {
  CommitPlan,
  GraphEdgeRecord,
  GraphSnapshot,
  GraphStatus,
  GraphSummary,
  GraphNodeRecord,
  GraphNodeType,
  GraphRelationship,
  GraphCommittedEvent,
  GraphOperationRecord,
} from "./types.js";

/** Lease for claimed outbox rows; mirrors the ingest dispatcher's safety margin. */
const CLAIM_LEASE_SECONDS = 60;

export interface GraphEventRecord {
  id: string;
  topic: string;
  payload: GraphCommittedEvent;
  attempts: number;
}

export class GraphRepository {
  public constructor(private readonly database: Database) {}

  async listGraphs(projectId: string): Promise<GraphSummary[]> {
    const rows = await this.database.db
      .select({
        id: graphs.id,
        projectId: graphs.projectId,
        title: graphs.title,
        status: graphs.status,
        version: graphs.version,
        createdAt: graphs.createdAt,
        updatedAt: graphs.updatedAt,
        nodeCount: sql<number>`count(distinct ${graphNodes.id})::integer`,
        edgeCount: sql<number>`count(distinct ${graphEdges.id})::integer`,
      })
      .from(graphs)
      .leftJoin(graphNodes, eq(graphNodes.graphId, graphs.id))
      .leftJoin(graphEdges, eq(graphEdges.graphId, graphs.id))
      .where(eq(graphs.projectId, projectId))
      .groupBy(graphs.id)
      .orderBy(desc(graphs.updatedAt));
    return rows.map(toSummary);
  }

  async createGraph(projectId: string, title: string, createdBy: string): Promise<GraphSummary> {
    const [row] = await this.database.db
      .insert(graphs)
      .values({ projectId, title, createdBy })
      .returning();
    if (!row) throw new Error("graph insert did not return a row");
    return toSummary({ ...row, nodeCount: 0, edgeCount: 0 });
  }

  async findGraphById(graphId: string) {
    const [row] = await this.database.db
      .select()
      .from(graphs)
      .where(eq(graphs.id, graphId))
      .limit(1);
    return row ?? null;
  }

  async renameGraph(graphId: string, title: string): Promise<GraphSummary | null> {
    const [row] = await this.database.db
      .update(graphs)
      .set({ title, updatedAt: new Date() })
      .where(eq(graphs.id, graphId))
      .returning();
    if (!row) return null;
    return toSummary({ ...row, ...(await this.countGraphContents(graphId)) });
  }

  async archiveGraph(graphId: string): Promise<GraphSummary | null> {
    const [row] = await this.database.db
      .update(graphs)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(graphs.id, graphId))
      .returning();
    if (!row) return null;
    return toSummary({ ...row, ...(await this.countGraphContents(graphId)) });
  }

  private async countGraphContents(
    graphId: string,
  ): Promise<{ nodeCount: number; edgeCount: number }> {
    const [row] = await this.database.db
      .select({
        nodeCount: sql<number>`count(distinct ${graphNodes.id})::integer`,
        edgeCount: sql<number>`count(distinct ${graphEdges.id})::integer`,
      })
      .from(graphs)
      .leftJoin(graphNodes, eq(graphNodes.graphId, graphs.id))
      .leftJoin(graphEdges, eq(graphEdges.graphId, graphs.id))
      .where(eq(graphs.id, graphId))
      .groupBy(graphs.id);
    return { nodeCount: row?.nodeCount ?? 0, edgeCount: row?.edgeCount ?? 0 };
  }

  async listNodes(graphId: string): Promise<GraphNodeRecord[]> {
    const rows = await this.database.db
      .select()
      .from(graphNodes)
      .where(eq(graphNodes.graphId, graphId));
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data,
      positionX: n.positionX,
      positionY: n.positionY,
    }));
  }

  async listEdges(graphId: string): Promise<GraphEdgeRecord[]> {
    const rows = await this.database.db
      .select()
      .from(graphEdges)
      .where(eq(graphEdges.graphId, graphId));
    return rows.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      relation: e.relation,
    }));
  }

  async getSnapshot(graphId: string): Promise<GraphSnapshot | null> {
    const graph = await this.findGraphById(graphId);
    if (!graph) return null;
    const nodes = await this.listNodes(graphId);
    const edges = await this.listEdges(graphId);
    return {
      id: graph.id,
      projectId: graph.projectId,
      title: graph.title,
      status: graph.status,
      version: graph.version,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as GraphNodeType,
        position: { x: n.positionX, y: n.positionY },
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        data: { relation: e.relation as GraphRelationship },
      })),
      updatedAt: graph.updatedAt.toISOString(),
    };
  }

  async getOperations(graphId: string, afterVersion: number): Promise<GraphOperationRecord[]> {
    const rows = await this.database.db
      .select()
      .from(graphOperations)
      .where(
        and(eq(graphOperations.graphId, graphId), gt(graphOperations.graphVersion, afterVersion)),
      )
      .orderBy(asc(graphOperations.graphVersion));
    return rows.map((row) => ({
      id: row.id,
      operationId: row.operationId,
      graphId: row.graphId,
      graphVersion: row.graphVersion,
      actorType: row.actorType,
      actorId: row.actorId,
      sessionId: row.sessionId,
      operations: row.operations,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async findOperation(
    graphId: string,
    operationId: string,
  ): Promise<{ graphVersion: number } | null> {
    const [row] = await this.database.db
      .select({ graphVersion: graphOperations.graphVersion })
      .from(graphOperations)
      .where(
        and(eq(graphOperations.graphId, graphId), eq(graphOperations.operationId, operationId)),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Apply a validated operation plan in one transaction: mutate nodes/edges,
   * bump the graph version, and record the operation plus its realtime outbox
   * row so the persisted commit and the eventual publish are atomic.
   */
  async commit(plan: CommitPlan): Promise<{ version: number }> {
    return this.database.db.transaction(async (transaction) => {
      for (const node of plan.insertNodes) {
        await transaction.insert(graphNodes).values({
          id: node.id,
          graphId: plan.graphId,
          type: node.type,
          positionX: node.position.x,
          positionY: node.position.y,
          data: node.data,
        });
      }

      for (const node of plan.updateNodes) {
        await transaction
          .update(graphNodes)
          .set({
            ...(node.data !== undefined ? { data: node.data } : {}),
            ...(node.position !== undefined
              ? { positionX: node.position.x, positionY: node.position.y }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(graphNodes.id, node.id));
      }

      for (const node of plan.deleteNodes) {
        await transaction.delete(graphNodes).where(eq(graphNodes.id, node.id));
      }

      for (const edge of plan.insertEdges) {
        await transaction.insert(graphEdges).values({
          id: edge.id,
          graphId: plan.graphId,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          relation: edge.relation,
          data: { relation: edge.relation },
        });
      }

      for (const edge of plan.updateEdges) {
        if (edge.relation === undefined) continue;
        await transaction
          .update(graphEdges)
          .set({
            relation: edge.relation,
            data: { relation: edge.relation },
            updatedAt: new Date(),
          })
          .where(eq(graphEdges.id, edge.id));
      }

      for (const edge of plan.deleteEdges) {
        await transaction.delete(graphEdges).where(eq(graphEdges.id, edge.id));
      }

      const [updatedGraph] = await transaction
        .update(graphs)
        .set({ version: sql`${graphs.version} + 1`, updatedAt: new Date() })
        .where(eq(graphs.id, plan.graphId))
        .returning();
      if (!updatedGraph) throw new Error("graph version bump did not return a row");

      const [storedOperation] = await transaction
        .insert(graphOperations)
        .values({
          operationId: plan.operationId,
          graphId: plan.graphId,
          graphVersion: updatedGraph.version,
          actorType: plan.actorType,
          actorId: plan.actorId,
          sessionId: plan.sessionId,
          operations: plan.operations,
        })
        .returning();
      if (!storedOperation) throw new Error("graph operation insert did not return a row");

      await transaction.insert(graphEventOutbox).values({
        operationId: storedOperation.id,
        topic: "graph.operation.committed",
        payload: {
          type: "graph.operation.committed",
          graphId: plan.graphId,
          graphVersion: updatedGraph.version,
          operationId: plan.operationId,
          operations: plan.operations,
        },
      });

      return { version: updatedGraph.version };
    });
  }

  /**
   * Atomically claim up to `limit` due realtime events, oldest first. Same CTE
   * `FOR UPDATE SKIP LOCKED` + lease pattern as the ingest dispatcher, so
   * multiple realtime-dispatcher instances race safely and crashed claims
   * become re-claimable after the lease expires.
   */
  async claimPendingEvents(limit: number): Promise<GraphEventRecord[]> {
    const result = await this.database.db.execute(sql`
      WITH claimed AS (
        SELECT id
        FROM graph_event_outbox
        WHERE status = 'pending'
          AND available_at <= now()
          AND (claimed_at IS NULL
               OR claimed_at < now() - make_interval(secs => ${CLAIM_LEASE_SECONDS}))
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE graph_event_outbox
      SET claimed_at = now()
      WHERE id IN (SELECT id FROM claimed)
      RETURNING id, topic, payload, attempts
    `);
    return result.rows.map((row) => ({
      id: row.id as string,
      topic: row.topic as string,
      payload: row.payload as GraphCommittedEvent,
      attempts: row.attempts as number,
    }));
  }

  async markEventPublished(id: string, publishedAt: Date): Promise<void> {
    await this.database.db
      .update(graphEventOutbox)
      .set({ status: "published", publishedAt })
      .where(and(eq(graphEventOutbox.id, id), eq(graphEventOutbox.status, "pending")));
  }

  async markEventRetry(input: {
    id: string;
    attempts: number;
    availableAt: Date;
    failed: boolean;
  }): Promise<void> {
    await this.database.db
      .update(graphEventOutbox)
      .set({
        attempts: input.attempts,
        availableAt: input.availableAt,
        claimedAt: null,
        status: input.failed ? "failed" : "pending",
      })
      .where(eq(graphEventOutbox.id, input.id));
  }
}

function toSummary(row: {
  id: string;
  projectId: string;
  title: string;
  status: GraphStatus;
  version: number;
  nodeCount: number;
  edgeCount: number;
  createdAt: Date;
  updatedAt: Date;
}): GraphSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    status: row.status as GraphStatus,
    version: row.version,
    nodeCount: row.nodeCount,
    edgeCount: row.edgeCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
