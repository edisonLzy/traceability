# app/

`@tracerability/app` is the Traceability Electron desktop app: Electron 39, electron-vite, React 19, Tailwind 4, TanStack Query, React Router, CodeMirror, TipTap, and a Zustand Agent store.

## Three-process model

| Process | Source | Runtime | Import convention |
| --- | --- | --- | --- |
| main | `src/main` | Electron main / Node | relative imports use `.js` |
| preload | `src/preload` | isolated bridge | relative imports use `.js` |
| renderer | `src/renderer` | browser | `@renderer`, `@shared`, `@extensions`; no `.js` suffix |

The renderer never imports Node APIs. It reaches main only through the allowlisted `window.electronAPI` bridge exposed by preload.

## Commands

Run from `app/`:

```bash
pnpm dev
pnpm build
pnpm test
pnpm typecheck
pnpm package
```

`build` writes `out/main`, `out/preload`, and `out/renderer`. `package` runs the build and electron-builder.

## TypeScript

- `tsconfig.json` covers `src` and `electron.vite.config.ts`, defines renderer aliases, and enables React JSX.
- `tsconfig.web.json` extends the base app config for the renderer/shared check.
- `tsconfig.node.json` checks main, preload, shared contracts, electron-vite config, and main/common extension modules with Electron/Node types.
- `src/shared` must satisfy both web and node projects.

Keep aliases synchronized in `tsconfig.json`, `electron.vite.config.ts`, and `vitest.config.ts`.

## State and services

The main process owns OS/backend capabilities:

- encrypted auth persistence in `src/main/auth`
- extension loading in `src/main/extensions`
- Agent prompts, models, skills, tools, and human-in-the-loop handling
- durable JSONL sessions in `src/main/sessions` under Electron `userData/sessions`
- protected backend requests in `src/main/trpc`

The renderer owns view state in `src/renderer/store` and product UI in `src/renderer/pages`. The Agent panel lives in `src/renderer/pages/(protected)/_components/AgentPanel`.

## Backend and auth

`VITE_SERVER_URL` selects the server. Login and token refresh use the server's auth tRPC procedures. The main process persists the access/refresh pair and attaches the access JWT to protected management requests. Do not reintroduce legacy static management tokens.

## Styling

Tailwind 4 is provided through `@tailwindcss/vite`; there is no Tailwind config file. Base UI primitives live in `src/renderer/components/ui`, and Lucide provides interface icons.

Long unbroken diagnostics must stay inside their panel. Use `min-w-0`, `max-w-full`, and an explicit wrapping policy such as `overflow-wrap:anywhere` at the content boundary; do not rely on an ancestor's `overflow-hidden` alone.

## Packaging

`electron-builder.yml` builds macOS DMG/ZIP and Windows NSIS packages. `resources/icon.png` is the shared high-resolution application icon and electron-builder derives platform icon resources from it. Release automation is documented in `.github/RELEASING.md`.
