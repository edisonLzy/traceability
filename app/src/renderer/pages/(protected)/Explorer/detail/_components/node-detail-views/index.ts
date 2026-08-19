import type { ComponentType } from "react";

import type { ExplorerFlowNode, ExplorerNodeType } from "../../../types";
import { CodeNodeDetail } from "./CodeNodeDetail";
import { DocumentNodeDetail } from "./DocumentNodeDetail";
import { EventNodeDetail } from "./EventNodeDetail";
import { FindingNodeDetail } from "./FindingNodeDetail";
import { IssueNodeDetail } from "./IssueNodeDetail";
import { QuestionNodeDetail } from "./QuestionNodeDetail";
import { ReplayNodeDetail } from "./ReplayNodeDetail";

/**
 * 详情面板里每种节点类型对应的 view 组件 props。外壳 (ExplorerNodeDetailPanel)
 * 持有 panel chrome（边框、header、footer），view 组件只负责 body 内容。
 */
export interface NodeDetailViewProps {
  node: ExplorerFlowNode;
  graphId: string;
  onClose: () => void;
}

export type NodeDetailView = ComponentType<NodeDetailViewProps>;
export type NodeDetailViewMap = Record<ExplorerNodeType, NodeDetailView>;

/**
 * 穷尽映射：`Record<ExplorerNodeType, ...>` 让 server 新增 kind 时，
 * TypeScript 立刻在此处报缺注册行——无需运行测试即可拦截。
 */
export const NODE_DETAIL_VIEWS: NodeDetailViewMap = {
  question: QuestionNodeDetail,
  finding: FindingNodeDetail,
  issue: IssueNodeDetail,
  event: EventNodeDetail,
  replay: ReplayNodeDetail,
  code: CodeNodeDetail,
  document: DocumentNodeDetail,
};
