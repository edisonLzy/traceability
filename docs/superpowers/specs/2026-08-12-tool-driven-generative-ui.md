# Tool-driven Generative UI

**Date:** 2026-08-12
**Status:** Approved for implementation

## Goal

Add a controlled Generative UI path to the Electron agent. The LLM selects a registered React
component by calling one terminal `render_ui` tool with JSON props. Registered components own
their data queries, loading/error states, navigation, and other domain behavior. The LLM never
generates executable UI code.

## Scope

- Add typed assistant-block definitions backed by Zod schemas.
- Build an assistant-block catalog in the main extension registry and expose it to the model.
- Add a terminal `render_ui({ type, props })` tool.
- Persist render results as UI-only agent messages and restore them with the session.
- Validate props in the renderer and isolate unknown, invalid, or crashing blocks.
- Migrate `projects.list` and `issues.list` to query current data from their React components.
- Retain `list_projects` and `list_issues` as non-terminal data tools.
- Keep the existing text-fence renderer for historical messages and keep `subagents.list`
  transient.

Out of scope: third-party component loading, remote UI protocols, generated HTML/React, a generic
action dispatcher, business-data snapshots, and the currently unused extension preload transport.

## Contracts

### Assistant-block definition

```ts
defineAssistantBlock({
  type: string,
  description: string,
  propsSchema: z.ZodType,
});
```

Main extensions register definitions with `ctx.assistantBlocks.register(definition)`. Renderer
extensions bind a definition to a component with
`ctx.assistantBlocks.register({ definition, render })`. The legacy `{ type, render }` shape remains
available for transient blocks such as `subagents.list`.

### Render tool

```ts
render_ui({ type: string, props: unknown })
```

The result contains a short text summary, `details.type = "generative-ui.render"`, the original
`details.assistantBlock = { type, props }`, and `terminate: true`. The prompt tells the model to call
this tool alone as the final action. Mixed tool batches retain pi-agent-core's native behavior.

### Durable UI message

```ts
{
  role: "assistantBlock";
  toolCallId: string;
  toolName: "render_ui";
  block: { type: string; props: unknown };
  timestamp: number;
}
```

Messages are deduplicated by `toolCallId`, stored through the existing message-entry JSONL path,
and filtered by the existing AgentMessage-to-LLM conversion. Reopening a session rerenders the
component and refetches current business data.

## Initial components

- `projects.list`: `{}` props; query the current project list in the renderer.
- `issues.list`: optional `projectId`, `status` (`all`, `unresolved`, `resolved`, `ignored`), and
  `limit` (1-100, default 20). Fall back to the currently selected project and filter status in the
  component.

Zod's default object behavior strips historical snapshot fields before rendering.

## Failure behavior

- Unknown block type: durable local error card.
- Invalid props: durable local error card containing Zod issues.
- Component exception: block-local error boundary.
- Every error card exposes the complete original props as collapsed formatted JSON.
- `render_ui` is suppressed from the transient tool-block bridge to avoid duplicate cards.

## Acceptance criteria

1. Registered block definitions appear in the generated system prompt with JSON schemas.
2. `render_ui` returns the original props and terminates a standalone tool batch.
3. Valid blocks receive schema-parsed props; unknown, invalid, and crashing blocks do not break the
   conversation.
4. Rendered blocks survive a session reload but never reach the LLM.
5. `projects.list` and `issues.list` fetch current data in the renderer.
6. Data tools no longer return assistant blocks or instruct the model to emit fences.
7. Historical text fences and `subagents.list` continue to work.
8. App tests, typecheck, and build pass.
