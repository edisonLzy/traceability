# shared/

The typed IPC contract between the main process and the renderer.

## Responsibility

Focused modules hold the shared request/response types, persisted session records, and Agent stream-event shapes. `events-ipc.ts` also exports the runtime allowlist constants used by preload; no contract may import app-specific main or renderer code. The Agent contracts are `agent-message.ts`, `ask-user-question-ipc.ts`, `events-ipc.ts`, `models-ipc.ts`, `session-ipc.ts`, and `skills-ipc.ts`.

Three processes import it, each differently:

- **main** (`src/main/**`): `import type { ... } from "../../shared/session-ipc.js"` - relative, `.js` suffix, `import type`.
- **preload** (`src/preload/index.ts`): `import type { ... } from "../shared/events-ipc.js"` - relative, `.js` suffix, `import type`.
- **renderer** (`src/renderer/**`): `import type { ... } from "@shared/session-ipc"` - alias, no suffix.

## Rules

- **Portable contracts only.** Keep runtime code out except for small literal allowlists such as `ALLOWED_MAIN_EXPOSE_EVENTS`. Every contract must remain importable by both `tsconfig` projects (web + node) and must not pull in Node or DOM globals.
- **No imports from `main/` or `renderer/`.** This directory depends on nothing inside `app/`. Shared management types come from the server tRPC router.
- When you add an IPC channel: add its request/response types here, a validated handler in main, and an entry in the typed preload allowlist. All three change together.
- Keep `AllowedMainExposeEvents` narrow and stable - the renderer branches on its event names, so renaming an event is a runtime-breaking change for `_layout/_agent`.
