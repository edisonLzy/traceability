# shared/

The typed IPC contract between the main process and the renderer.

## Responsibility

Focused modules hold request/response types for auth, Agent messages, human-in-the-loop prompts, events, models, sessions, session persistence, skills, themes, and tRPC output. `events-ipc.ts` also exports the runtime allowlist constants used by preload; no contract may import app-specific main or renderer code.

Three processes import it, each differently:

- **main** (`src/main/**`): `import type { ... } from "../../shared/session-ipc.js"` - relative, `.js` suffix, `import type`.
- **preload** (`src/preload/index.ts`): `import type { ... } from "../shared/events-ipc.js"` - relative, `.js` suffix, `import type`.
- **renderer** (`src/renderer/**`): `import type { ... } from "@shared/session-ipc"` - alias, no suffix.

## Rules

- **Portable contracts only.** Keep runtime code out except for small literal allowlists such as `ALLOWED_MAIN_EXPOSE_EVENTS`. Every contract must remain importable by both `tsconfig` projects (web + node) and must not pull in Node or DOM globals.
- **No imports from `main/` or `renderer/`.** This directory depends on nothing inside `app/`. Shared management types come from the server tRPC router.
- When you add an IPC channel: add its request/response types here, a validated handler in main, and an entry in the typed preload allowlist. All three change together.
- Keep `AllowedMainExposeEvents` narrow and stable - the Agent panel and other renderer consumers branch on those event names, so renaming one is a runtime-breaking change.
