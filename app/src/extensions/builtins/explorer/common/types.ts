export const EXPLORER_GRAPH_CREATED_BLOCK_TYPE = "explorer.graph.created";

export interface ExplorerGraphCreatedBlockProps {
  projectId: string;
  graphId: string;
  title: string;
  version: number;
  nodeCount?: number;
  edgeCount?: number;
}

export const EXPLORER_CREATE_GRAPH_TOOL = "explorer_create_graph";
export const EXPLORER_CREATE_QUESTION_TOOL = "explorer_create_question_node";
export const EXPLORER_CREATE_FINDING_TOOL = "explorer_create_finding_node";
export const EXPLORER_CREATE_ISSUE_TOOL = "explorer_create_issue_node";
export const EXPLORER_CREATE_EVENT_TOOL = "explorer_create_event_node";
export const EXPLORER_CREATE_REPLAY_TOOL = "explorer_create_replay_node";
export const EXPLORER_CREATE_CODE_TOOL = "explorer_create_code_node";
export const EXPLORER_CREATE_DOCUMENT_TOOL = "explorer_create_document_node";
export const EXPLORER_CONNECT_NODES_TOOL = "explorer_connect_nodes";
export const EXPLORER_DELETE_NODE_TOOL = "explorer_delete_node";
export const EXPLORER_DELETE_EDGE_TOOL = "explorer_delete_edge";
