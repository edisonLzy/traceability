import { mergeAttributes, type Range } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import { Bug } from "lucide-react";

import { IconNode } from "../components/icon-node";

const ISSUE_NODE_NAME = "issueNode";

interface IssueNodeAttrs {
  id: string;
  label?: string | null;
}

interface InsertIssueNodeOptions {
  editor: Editor;
  issue: IssueNodeAttrs;
  range?: Range;
  trailingSpace?: boolean;
}

export function insertIssueNode({
  editor,
  issue,
  range,
  trailingSpace = true,
}: InsertIssueNodeOptions) {
  const content = [
    {
      type: ISSUE_NODE_NAME,
      attrs: {
        id: issue.id,
        label: issue.label ?? issue.id,
      },
    },
    ...(trailingSpace ? [{ type: "text", text: " " }] : []),
  ];

  const chain = editor.chain().focus();

  if (range) {
    return chain.insertContentAt(range, content).run();
  }

  return chain.insertContent(content).run();
}

export const issueNode = Mention.extend({
  name: ISSUE_NODE_NAME,
  selectable: false,

  addNodeView() {
    return ReactNodeViewRenderer(IssueNodeView);
  },
}).configure({
  HTMLAttributes: {
    class: "issue-node",
    "data-inline-node": "issue",
  },
  renderHTML({ node, options }) {
    return [
      "span",
      mergeAttributes(options.HTMLAttributes, {
        "data-issue-id": node.attrs.id,
        "data-issue-label": node.attrs.label ?? node.attrs.id,
      }),
      `#${node.attrs.label ?? node.attrs.id ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `<issue id="${escapeXmlAttribute(node.attrs.id ?? "")}"></issue>`;
  },
});

function IssueNodeView({ deleteNode, node }: NodeViewProps) {
  const label = node.attrs.label ?? node.attrs.id ?? "";

  return (
    <NodeViewWrapper as="span" className="inline-flex align-baseline" contentEditable={false}>
      <IconNode icon={<Bug aria-hidden="true" />} onRemove={deleteNode}>
        {label}
      </IconNode>
    </NodeViewWrapper>
  );
}

function escapeXmlAttribute(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
