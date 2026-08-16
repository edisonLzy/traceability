---
name: explorer-graph-create
description: Create an Explorer evidence graph after confirming context and intent with the user.
---

# Explorer Graph Create

Use this skill only when the user explicitly asks to create an Exploring Graph.

## Required workflow

1. Collect context from the prompt. Identify the Project, target Issue or object, investigation question, intent, and evidence scope. If the target is ambiguous, use the existing issue/project tools to find candidates.
2. Before any Explorer Graph tool call, restate the context and intent and ask the user to confirm or modify it with `AskUserQuestion`.
3. After the context and intent are confirmed, ask whether the user wants an Exploring Graph. The choices are create, keep the analysis without creating, or modify context. Do not write Graph data for the latter two choices.
4. If the user chooses create, show a read-only Markdown or Mermaid example of the expected graph. Ask for final confirmation. Do not call any Explorer Graph mutation tool until the user confirms this preview.
5. After final confirmation, call `explorer_create_graph` with the explicitly confirmed `projectId` and title. Pass the returned `graphId` explicitly to all subsequent node and edge tools.
6. Return a concise summary and let the `explorer.graph.created` assistant block provide the Open Graph action.

## Context rules

- Never infer `projectId` or `graphId` from the current route, Project Store, desktop device, or hidden application context.
- Never create a partial graph before final confirmation.
- If creation succeeds but a later node or edge operation fails, report the committed graph and the failed operation. Do not silently delete or roll back committed data.
- If the user cancels or asks to modify context, stop mutations and return to context collection.

## Preview format

```text
我理解为：
- Project：<confirmed project>
- Target：<confirmed issue or object>
- Intent：<confirmed investigation intent>
- Evidence scope：<confirmed scope>

预计创建：

Question: <question>
  ├── Issue: <issue>
  └── Finding: 待 Agent 调查
        └── Code: 待定位
```

Explorer tools require explicit `projectId` and `graphId` arguments. Use only the typed Explorer tools exposed by the app after the user confirms the preview.
