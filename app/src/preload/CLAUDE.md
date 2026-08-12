# preload/

The **only** bridge between the main process and the renderer. One file: `index.ts`.

## Responsibility

`index.ts` calls `contextBridge.exposeInMainWorld("electronAPI", api)`, exposing a small, typed `window.electronAPI` object to the renderer. It is the entire surface area the renderer can use to reach Node/the OS - everything not on this object is unreachable from the renderer.

## Structure

The `api` exposes two typed, allowlisted entry points that mirror main's split shared contracts:

- `invoke(channel, ...args)` for `AllowedRenderInvokeEvents`, including auth, session persistence, Agent runtime, models, Skills, themes, tRPC access, and window channels.
- `on(event, handler)` for `AllowedMainExposeEvents`; it wraps `ipcRenderer.on` and returns an unsubscribe function.

## Rules

- **No business logic.** Each method is a one-line `ipcRenderer.invoke(...)` (or `listen` for subscriptions). Validation, state, and side effects all live in main. If you are tempted to add logic here, it belongs in `main/index.ts` (app shell) or the owning main-process service (behavior) instead.
- **Types come from split shared contracts.** Use relative `.js` imports such as `../shared/events-ipc.js` and `../shared/session-ipc.js`. The preload declaration must expose the corresponding typed `window.electronAPI` to the renderer.
- **Every allowlisted channel must have a validated handler in main.** Adding an invoke union member without a matching `ipcMain.handle` (or removing the handler) breaks the bridge.
- **Keep the surface narrow.** Do not expose `ipcRenderer` directly. `invoke` is safe only because its channel is a compile-time allowlist; never widen it to arbitrary strings.
- Import specifiers use the `.js` suffix (this is a `tsc`-emitted ESM build, see `app/CLAUDE.md`).

## Security posture

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`. The preload runs in an isolated world with Node access; the renderer does not have Node access and can only call what `contextBridge` exposes. Preserve this - never set `nodeIntegration: true` and never expand the preload to forward arbitrary channels.
