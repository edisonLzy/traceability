export const EXPLORER_GRAPH_CREATED_BLOCK_TYPE = "explorer.graph.created";
export const EXPLORER_GRAPH_LIST_BLOCK_TYPE = "explorer.graph.list";
export const EXPLORER_NODE_LIST_BLOCK_TYPE = "explorer.graph.nodes";

export interface ExplorerGraphCreatedBlockProps {
  projectId: string;
  graphId: string;
  title: string;
  version: number;
  nodeCount?: number;
  edgeCount?: number;
}

export interface ExplorerGraphListBlockProps {
  projectId: string;
  graphs: Array<{
    id: string;
    title: string;
    status: string;
    version: number;
    nodeCount: number;
    edgeCount: number;
  }>;
}

export interface ExplorerNodeListBlockProps {
  projectId: string;
  graphId: string;
  title: string;
  nodes: Array<{ id: string; type: string; label: string }>;
}

export const EXPLORER_CREATE_GRAPH_TOOL = "explorer_create_graph";
export const EXPLORER_CREATE_QUESTION_TOOL = "explorer_create_question_node";
export const EXPLORER_CREATE_FINDING_TOOL = "explorer_create_finding_node";
export const EXPLORER_CREATE_ISSUE_TOOL = "explorer_create_issue_node";
export const EXPLORER_CREATE_EVENT_TOOL = "explorer_create_event_node";
export const EXPLORER_CREATE_REPLAY_TOOL = "explorer_create_replay_node";
export const EXPLORER_CREATE_CODE_TOOL = "explorer_create_code_node";
export const EXPLORER_CREATE_DOCUMENT_TOOL = "explorer_create_document_node";
export const EXPLORER_CREATE_YOUTUBE_TOOL = "explorer_create_youtube_node";
export const EXPLORER_CONNECT_NODES_TOOL = "explorer_connect_nodes";
export const EXPLORER_DELETE_NODE_TOOL = "explorer_delete_node";
export const EXPLORER_DELETE_EDGE_TOOL = "explorer_delete_edge";
export const EXPLORER_LIST_GRAPHS_TOOL = "explorer_list_graphs";
export const EXPLORER_LIST_NODES_TOOL = "explorer_list_nodes";
export const EXPLORER_GET_NODE_TOOL = "explorer_get_node";
