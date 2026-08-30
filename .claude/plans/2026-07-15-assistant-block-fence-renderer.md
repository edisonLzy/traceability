# Plan: Wire the inline `agent-block` fence renderer into `AssistantResponseMessage`

## Problem

A plugin registers an assistant block via `ctx.assistantBlocks.register({ type, render })`
and the LLM emits it inline as a fenced code block in its text response. In Divisor this
renders via a Streamdown **custom renderer** (`PluginBlockRenderer`) keyed on the
`divisor-block` fence language. Traceability forked the infra
(`DIVISOR_BLOCK_LANGUAGE`, `parseAssistantBlockPayload`, `parseExtensionParts`) but never
wired it into `AssistantResponseMessage`, which is just `<Streamdown>{text}</Streamdown>`.
So the fence renders as a raw code block and the registered component never mounts —
"the plugin's registered assistant block can't render."

Scope chosen: **wire the fence renderer only** (path 2). The tool-`details.assistantBlock`
path (path 1, used by the `issues`/`apps` builtins) already works and is left untouched.
Fence language: **`agent-block`** (rename from the leftover `divisor-block`).

## Verified facts

- Streamdown 2.5.0 API (confirmed in `node_modules/.pnpm/streamdown@2.5.0.../dist/index.d.ts`):
  - `Streamdown` accepts `plugins?: PluginConfig`, `isAnimating?: boolean`.
  - `PluginConfig = { code?: ...; renderers?: CustomRenderer[] }`.
  - `CustomRenderer = { component: ComponentType<CustomRendererProps>; language: string | string[] }`.
  - `CustomRendererProps = { code: string; isIncomplete: boolean; language: string; ... }`.
- `@extensions` → `app/src/extensions` (alias in `electron.vite.config.ts:38` + `tsconfig.json:10`).
- `useAssistantBlock` exported from `@extensions/core/renderer` (`renderer/index.ts:6`).
- `parseAssistantBlockPayload(raw, isIncomplete)` exported from `@extensions/core/common`
  (`common/index.ts:37`) — returns `{status:"ready",payload:{type,props,raw}} | {status:"pending"}
| {status:"invalid"}`.
- `DIVISOR_BLOCK_LANGUAGE` / `formatAssistantBlockFence` are referenced **nowhere** outside
  `core/common/index.ts`; the `divisor-block` literal appears only there and in
  `core/renderer/parser.ts:11`. No extension emits fences today. Rename is contained.
- No extension registers Streamdown `components`/`rehypePlugins`, so passing only
  `plugins.renderers` changes nothing else.
- `AssistantResponseMessage` is called from `assistant-message.tsx:114` as
  `<AssistantResponseMessage text={block.text} />`; `isStreaming` is in scope there.

## Changes

### 1. `app/src/extensions/core/common/index.ts` — rename language constant

- `export const DIVISOR_BLOCK_LANGUAGE = "divisor-block"` →
  `export const AGENT_BLOCK_LANGUAGE = "agent-block"`.
- `formatAssistantBlockFence` already uses the constant, so it now emits ` ```agent-block `.
- `parseAssistantBlockPayload` is unchanged (it parses JSON inside the fence, not the language).

### 2. `app/src/extensions/core/renderer/parser.ts` — keep regex in sync

- `EXTENSION_FENCE_PATTERN` literal `/(divisor-block)/` → `/(agent-block)/`
  (for consistency; `parseExtensionParts` stays available but is not wired here).

### 3. `app/src/renderer/pages/_layout/_agent/messages/assistant-response-message.tsx` — wire the renderer

Replace the bare `<Streamdown>` with one that passes a `plugins.renderers` entry for the
`agent-block` language. Add `isStreaming` prop (drives `isAnimating` so mid-stream fences
report `isIncomplete` correctly). Add a `PluginBlockRenderer` that:

1. `parseAssistantBlockPayload(code, isIncomplete)` →
   - `pending` → render a small "Rendering…" placeholder (matches Divisor).
   - `invalid` → render a small fallback noting an unsupported/malformed block.
   - `ready` → look up `useAssistantBlock(payload.type)`; if missing, render the same
     fallback with the `type`; else render `<Block props={payload.props} raw={payload.raw} />`.
2. Calls `useAssistantBlock` **unconditionally at the top** (hooks-safe; pass `""` when no
   type yet — same pattern as `assistant-tool-message.tsx:11`).

`plugins` object wrapped in `useMemo([])` for referential stability (Streamdown re-parses
on `plugins` identity change). Signature becomes
`AssistantResponseMessage({ text, isStreaming }: { text: string; isStreaming: boolean })`.

### 4. `app/src/renderer/pages/_layout/_agent/messages/assistant-message.tsx` — pass `isStreaming`

- Line ~114: `<AssistantResponseMessage text={block.text} />` →
  `<AssistantResponseMessage text={block.text} isStreaming={isStreaming} />`.

## Out of scope (per chosen scope)

- Porting Divisor's `AssistantToolMessage` tool-execution card (status/input/output).
- Porting `FloatingToolbar` / `Message` wrapper / token-usage / fork into `AssistantMessage`.
- Wiring registry `components` / `rehypePlugins` into `AssistantResponseMessage`.
- `AssistantThinkingMessage` alignment.

## Verification

- `pnpm --filter @traceability/app typecheck`.
- `pnpm --filter @traceability/app lint` (oxlint).
- Manual: emit a ` ```agent-block\n{"type":"issues.list","props":{...}}\n``` ` fence in an
  assistant text response and confirm the registered block renders inline (and a plain
  ` ```ts ` code block still renders normally).
