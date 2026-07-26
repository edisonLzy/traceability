# Monitor SDK Consolidation Design

**Date:** 2026-07-22
**Status:** Design — approved, ready for planning

## Problem

The collection SDK is currently split across 4 independent packages, each a thin (~30–120 lines) wrapper around Sentry:

| Package | Lines | Purpose | Depends on |
|---|---|---|---|
| `@traceability/browser` | ~90 | Browser Sentry init + integrations | `@sentry/browser`, shared |
| `@traceability/react` | ~45 | React ErrorBoundary + hooks | `@sentry/react`, browser |
| `@traceability/electron` | ~120 | Electron main (env monitor) + renderer | `@sentry/electron`, browser, shared |
| `@traceability/shared` | ~33 | `createBearerTransport` | `@sentry/core` (type only) |

Maintaining 4 separate `package.json`, `tsconfig.json`, build configs, and version bumps for ~300 total lines of logic is not justified.

## Decision

Consolidate into a **single `@traceability/monitor`** package with sub-path exports.

## New Structure

```
packages/monitor/
  package.json            # @traceability/monitor
  tsconfig.json
  vitest.config.ts
  src/
    integrations/
      corsDiagnostic.ts
      whiteScreen.ts
    browser/
      index.ts
    react/
      index.ts
      ErrorBoundary.tsx
      hooks.ts
    electron-main/
      index.ts
      environment.ts
    electron-renderer/
      index.ts
```

### Package Exports

```jsonc
{
  "name": "@traceability/monitor",
  "exports": {
    ".": {
      "types": "./src/browser/index.ts",
      "import": "./src/browser/index.ts"
    },
    "./react": {
      "types": "./src/react/index.ts",
      "import": "./src/react/index.ts"
    },
    "./electron-main": {
      "types": "./src/electron-main/index.ts",
      "import": "./src/electron-main/index.ts"
    },
    "./electron-renderer": {
      "types": "./src/electron-renderer/index.ts",
      "import": "./src/electron-renderer/index.ts"
    }
  },
  "dependencies": {
    "@sentry/browser": "^8.0.0",
    "@sentry/core": "^8.0.0",
    "@sentry/electron": "^5.0.0",
    "@sentry/react": "^8.0.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "electron": ">=30"
  }
}
```

### Key Design Decisions

1. **Tree-shaking isolation**: Electron deps (`@sentry/electron`) are regular dependencies. Browser-only projects never import `@traceability/monitor/electron-*`, so tree-shaking avoids bundling the Electron code. No dynamic imports or optional deps needed.

2. **`@traceability/shared` removed**: `createBearerTransport` is dropped — the server will support DSN-based ingestion directly. No replacement needed.

3. **Internal cross-references become relative imports**:
   - `react/hooks.ts` → `../browser/index.js` (was `@traceability/browser`)
   - `electron/renderer/index.ts` → `../browser/index.js` (was `@traceability/browser`)
   - `electron/main/index.ts` → no longer imports from shared (removed)

### Packages to Delete

| Package | Reason |
|---|---|
| `packages/browser/` | Merged into `monitor/browser/` |
| `packages/react/` | Merged into `monitor/react/` |
| `packages/electron/` | Merged into `monitor/electron-main/` + `monitor/electron-renderer/` |
| `packages/shared/` | `createBearerTransport` no longer needed |

### Import Path Migration

| Old | New |
|---|---|
| `@traceability/browser` | `@traceability/monitor` |
| `@traceability/react` | `@traceability/monitor/react` |
| `@traceability/electron/main` | `@traceability/monitor/electron-main` |
| `@traceability/electron/renderer` | `@traceability/monitor/electron-renderer` |
| `@traceability/shared` | removed |

### Implementation Steps

#### Step 1: Create `packages/monitor/`

Copy source files from existing packages into the new structure:

```
packages/monitor/
  src/
    integrations/   ← from packages/browser/src/integrations/
    browser/        ← from packages/browser/src/
    react/          ← from packages/react/src/
    electron-main/  ← from packages/electron/src/main/
    electron-renderer/  ← from packages/electron/src/renderer/
```

#### Step 2: Fix internal imports in new locations

- `packages/monitor/src/react/hooks.ts` — change `@traceability/browser` → `../browser/index.js`
- `packages/monitor/src/react/index.ts` — change `./ErrorBoundary.js` (no change needed, stays same)
- `packages/monitor/src/electron-renderer/index.ts` — change `@traceability/browser` → `../browser/index.js`
- `packages/monitor/src/electron-main/index.ts` — remove `@traceability/shared` import (`createBearerTransport` no longer needed)
- `packages/monitor/src/browser/index.ts` — change `@traceability/shared` → remove that export (no longer needed)

#### Step 3: Wire up examples

- `examples/web-demo/package.json` — change `@traceability/browser` → `@traceability/monitor`
- `examples/web-demo/src/traceability.ts` — change import
- `examples/web-demo/src/register.ts` — change import
- `examples/electron-demo/package.json` — change `@traceability/electron` → `@traceability/monitor`
- `examples/electron-demo/src/main.ts` — change import
- `examples/electron-demo/renderer/src/renderer.ts` — change import
- `examples/electron-demo/vite.renderer.config.ts` — check if `@sentry/electron` path alias needed

#### Step 4: Delete old packages

Remove `packages/browser/`, `packages/react/`, `packages/electron/`, `packages/shared/`.

#### Step 5: Update pnpm-workspace.yaml

No change needed — `packages/*` already captures the new `packages/monitor/`.

### What stays unchanged

- `packages/client` — API client, separate concern
- `packages/protocol` — shared types
- `packages/cli` — CLI tool
- `packages/skills` — skill modules
- `app/` — Electron app (already doesn't depend on SDK packages directly)
- `server/` — backend
