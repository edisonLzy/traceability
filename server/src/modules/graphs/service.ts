import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";

import type { GraphRepository } from "./repository.js";
import {
  GRAPH_NODE_TYPES,
  GRAPH_RELATIONSHIPS,
  nodeDataSchema,
  type ApplyGraphOperationsInput,
  type ApplyGraphOperationsResult,
  type AppliedOperation,
  type CommitPlan,
  type GraphSnapshot,
  type GraphSummary,
  type GraphOperationRecord,
  type GraphNodeData,
} from "./types.js";

export class GraphService {
  public constructor(private readonly repository: GraphRepository) {}

  listGraphs(projectId: string): Promise<GraphSummary[]> {
    return this.repository.listGraphs(projectId);
  }

  createGraph(projectId: string, title: string, actorId: string): Promise<GraphSummary> {
    return this.repository.createGraph(projectId, title, actorId);
  }

  async getGraph(projectId: string, graphId: string): Promise<GraphSnapshot | null> {
    const graph = await this.repository.findGraphById(graphId);
    if (!graph || graph.projectId !== projectId) return null;
    return this.repository.getSnapshot(graphId);
  }

  async renameGraph(projectId: string, graphId: string, title: string): Promise<GraphSummary> {
    await this.assertGraphInProject(projectId, graphId);
    const updated = await this.repository.renameGraph(graphId, title);
    if (!updated) throw notFound();
    return updated;
  }

  async archiveGraph(projectId: string, graphId: string): Promise<GraphSummary> {
    await this.assertGraphInProject(projectId, graphId);
    const updated = await this.repository.archiveGraph(graphId);
    if (!updated) throw notFound();
    return updated;
  }

  async getOperations(
    projectId: string,
    graphId: string,
    afterVersion: number,
  ): Promise<GraphOperationRecord[]> {
    await this.assertGraphInProject(projectId, graphId);
    return this.repository.getOperations(graphId, afterVersion);
  }

  async applyOperations(
    projectId: string,
    input: ApplyGraphOperationsInput,
    actorId: string,
  ): Promise<ApplyGraphOperationsResult> {
    const graph = await this.repository.findGraphById(input.graphId);
    if (!graph || graph.projectId !== projectId) throw notFound();

    const existing = await this.repository.findOperation(input.graphId, input.operationId);
    if (existing) {
      return {
        graphId: input.graphId,
        version: existing.graphVersion,
        alreadyApplied: true,
        idMappings: {},
        applied: [],
      };
    }

    if (graph.version !== input.baseVersion) throw versionConflict(graph.version);

    const { plan, idMappings, applied } = await this.resolveOperations(input, actorId);
    const { version } = await this.repository.commit(plan);

    return { graphId: input.graphId, version, alreadyApplied: false, idMappings, applied };
  }

  private async assertGraphInProject(projectId: string, graphId: string): Promise<void> {
    const graph = await this.repository.findGraphById(graphId);
    if (!graph || graph.projectId !== projectId) throw notFound();
  }

  /**
   * Validate every operation, resolve client temporary node ids to persisted
   * uuids, and assemble a concrete commit plan. Uses an in-memory view of the
   * graph (loaded once) so same-batch edge references and delete-then-update
   * are detected before anything is written.
   */
  private async resolveOperations(
    input: ApplyGraphOperationsInput,
    actorId: string,
  ): Promise<{
    plan: CommitPlan;
    idMappings: Record<string, string>;
    applied: AppliedOperation[];
  }> {
    const nodes = await this.repository.listNodes(input.graphId);
    const edges = await this.repository.listEdges(input.graphId);

    const nodeMap = new Map<string, { type: string; data: GraphNodeData }>();
    for (const n of nodes) nodeMap.set(n.id, { type: n.type, data: n.data });
    const edgeSet = new Set(edges.map((e) => e.id));

    // client temp id -> real id for nodes created within this batch
    const tempToReal = new Map<string, string>();
    const idMappings: Record<string, string> = {};
    const applied: AppliedOperation[] = [];

    const plan: CommitPlan = {
      graphId: input.graphId,
      operationId: input.operationId,
      actorType: input.actor.type,
      actorId,
      sessionId: input.actor.sessionId ?? null,
      operations: input.operations,
      insertNodes: [],
      updateNodes: [],
      deleteNodes: [],
      insertEdges: [],
      updateEdges: [],
      deleteEdges: [],
    };

    const resolveNodeId = (clientId: string): string => {
      const mapped = tempToReal.get(clientId);
      if (mapped) return mapped;
      if (nodeMap.has(clientId)) return clientId;
      throw invalidOperation(`node ${clientId} not found in graph`);
    };

    for (const op of input.operations) {
      switch (op.op) {
        case "createNode": {
          if (!GRAPH_NODE_TYPES.includes(op.type)) {
            throw invalidOperation(`unknown node type ${op.type}`);
          }
          const parsed = nodeDataSchema.safeParse(op.data);
          if (!parsed.success) throw invalidOperation(`invalid node data for type ${op.type}`);
          if (op.type !== parsed.data.kind) {
            throw invalidOperation(
              `node type ${op.type} does not match data kind ${parsed.data.kind}`,
            );
          }
          const realId = randomUUID();
          tempToReal.set(op.id, realId);
          idMappings[op.id] = realId;
          nodeMap.set(realId, { type: op.type, data: parsed.data });
          plan.insertNodes.push({
            id: realId,
            type: op.type,
            position: op.position,
            data: parsed.data,
          });
          applied.push({ op: "createNode", id: op.id, nodeId: realId });
          break;
        }
        case "updateNode": {
          const realId = resolveNodeId(op.id);
          const existing = nodeMap.get(realId);
          if (!existing) throw invalidOperation(`node ${op.id} not found`);
          if (op.data === undefined && op.position === undefined) {
            throw invalidOperation(`updateNode ${op.id} requires data or position`);
          }
          let data = existing.data;
          if (op.data !== undefined) {
            const merged = { ...existing.data, ...op.data } as GraphNodeData;
            const parsed = nodeDataSchema.safeParse(merged);
            if (!parsed.success) throw invalidOperation(`invalid merged node data for ${op.id}`);
            data = parsed.data;
          }
          nodeMap.set(realId, { type: existing.type, data });
          plan.updateNodes.push({
            id: realId,
            ...(op.data !== undefined ? { data } : {}),
            ...(op.position !== undefined ? { position: op.position } : {}),
          });
          applied.push({ op: "updateNode", id: op.id, nodeId: realId });
          break;
        }
        case "deleteNode": {
          const realId = resolveNodeId(op.id);
          if (!nodeMap.has(realId)) throw invalidOperation(`node ${op.id} not found`);
          nodeMap.delete(realId);
          plan.deleteNodes.push({ id: realId });
          applied.push({ op: "deleteNode", id: op.id, nodeId: realId });
          break;
        }
        case "moveNodes": {
          for (const position of op.positions) {
            const realId = resolveNodeId(position.id);
            plan.updateNodes.push({ id: realId, position: position.position });
            applied.push({ op: "moveNodes", id: position.id, nodeId: realId });
          }
          break;
        }
        case "createEdge": {
          if (!GRAPH_RELATIONSHIPS.includes(op.relation)) {
            throw invalidOperation(`unknown relation ${op.relation}`);
          }
          const source = resolveNodeId(op.source);
          const target = resolveNodeId(op.target);
          const realId = randomUUID();
          plan.insertEdges.push({
            id: realId,
            sourceNodeId: source,
            targetNodeId: target,
            sourceHandle: op.sourceHandle ?? null,
            targetHandle: op.targetHandle ?? null,
            relation: op.relation,
            ...(op.sourceAnchorId !== undefined ? { sourceAnchorId: op.sourceAnchorId } : {}),
            ...(op.targetAnchorId !== undefined ? { targetAnchorId: op.targetAnchorId } : {}),
          });
          applied.push({ op: "createEdge", id: op.id, edgeId: realId });
          break;
        }
        case "updateEdge": {
          if (op.relation !== undefined && !GRAPH_RELATIONSHIPS.includes(op.relation)) {
            throw invalidOperation(`unknown relation ${op.relation}`);
          }
          if (!edgeSet.has(op.id)) throw invalidOperation(`edge ${op.id} not found`);
          plan.updateEdges.push({
            id: op.id,
            ...(op.relation !== undefined ? { relation: op.relation } : {}),
            ...(op.sourceAnchorId !== undefined ? { sourceAnchorId: op.sourceAnchorId } : {}),
            ...(op.targetAnchorId !== undefined ? { targetAnchorId: op.targetAnchorId } : {}),
          });
          applied.push({ op: "updateEdge", id: op.id, edgeId: op.id });
          break;
        }
        case "deleteEdge": {
          if (!edgeSet.has(op.id)) throw invalidOperation(`edge ${op.id} not found`);
          plan.deleteEdges.push({ id: op.id });
          applied.push({ op: "deleteEdge", id: op.id, edgeId: op.id });
          break;
        }
      }
    }

    return { plan, idMappings, applied };
  }
}

function notFound(): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message: "graph not found" });
}

function versionConflict(currentVersion: number): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: `graph version conflict: current version is ${currentVersion}`,
  });
}

function invalidOperation(message: string): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message });
}
