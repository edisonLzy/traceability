# Monitor SDK Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate `@traceability/browser`, `@traceability/react`, `@traceability/electron`, and `@traceability/shared` into a single `@traceability/monitor` package with sub-path exports.

**Architecture:** Single package with four named exports — default (browser), `/react`, `/electron-main`, `/electron-renderer`. Internal cross-references switch from package imports to relative imports. `@traceability/shared` is removed (server will adopt DSN-based ingestion).

**Tech Stack:** TypeScript, pnpm workspace, vitest

## Global Constraints

- All packages are `type: module` — use `.js` extension in relative imports (matched to emitted JS, not source `.ts`)
- Follow the `exports` map in `package.json` exactly — no `main`/`types` fallback when `exports` is present
- Delete old packages completely (`browser/`, `react/`, `electron/`, `shared/`)
- `createBearerTransport` from `@traceability/shared` is dropped entirely — no replacement
- `@sentry/electron` is a regular dependency — tree-shaking handles isolation

---

### Task 1: Create packages/monitor/ — package scaffolding

**Files:**
- Create: `packages/monitor/package.json`
- Create: `packages/monitor/tsconfig.json`
- Create: `packages/monitor/vitest.config.ts`

**Interfaces:**
- Consumes: nothing
- Produces: empty package scaffold with correct `exports` map for 4 entry points

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/monitor/src/{integrations,browser,react,electron-main,electron-renderer}
mkdir -p packages/monitor/tests
```

- [ ] **Step 2: Create `packages/monitor/package.json`**

```json
{
  "name": "@traceability/monitor",
  "version": "1.0.0",
  "private": true,
  "type": "module",
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
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@sentry/browser": "^8.0.0",
    "@sentry/core": "^8.0.0",
    "@sentry/electron": "^5.0.0",
    "@sentry/react": "^8.0.0"
  },
  "devDependencies": {
    "jsdom": "^25.0.0",
    "vitest": "catalog:"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    }
  }
}
```

- [ ] **Step 3: Create `packages/monitor/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/monitor/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
  resolve: {
    extensions: [".ts", ".js"],
    extensionAlias: { ".js": [".ts", ".js"] },
  },
  esbuild: { target: "es2022" },
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/monitor/
git commit -m "chore: scaffold @traceability/monitor package"
```

### Task 2: Copy browser source and integrations

**Files:**
- Copy: `packages/browser/src/integrations/` → `packages/monitor/src/integrations/`
- Copy: `packages/browser/src/index.ts` → `packages/monitor/src/browser/index.ts`
- Copy: `packages/browser/tests/integrations.test.ts` → `packages/monitor/tests/integrations.test.ts`

**Interfaces:**
- Produces: `packages/monitor/src/browser/index.ts` exports `init`, `captureException`, `captureMessage`, `setUser`, `setTag`, `setContext`, `addBreadcrumb`, `withScope`, `browserTracingIntegration`, `replayIntegration`, `corsDiagnosticIntegration`, `whiteScreenIntegration`, `WhiteScreenOptions`

- [ ] **Step 1: Copy files**

```bash
cp packages/browser/src/integrations/corsDiagnostic.ts packages/monitor/src/integrations/corsDiagnostic.ts
cp packages/browser/src/integrations/whiteScreen.ts packages/monitor/src/integrations/whiteScreen.ts
cp packages/browser/src/index.ts packages/monitor/src/browser/index.ts
cp packages/browser/tests/integrations.test.ts packages/monitor/tests/integrations.test.ts
```

- [ ] **Step 2: Remove `createBearerTransport` export from `browser/index.ts`**

Edit `packages/monitor/src/browser/index.ts` — remove line `export { createBearerTransport } from "@traceability/shared";`.

```diff
- export { createBearerTransport } from "@traceability/shared";
```

- [ ] **Step 3: Commit**

```bash
git add packages/monitor/
git commit -m "feat(monitor): add browser entry + integrations"
```

### Task 3: Copy React source

**Files:**
- Copy: `packages/react/src/` → `packages/monitor/src/react/`

**Interfaces:**
- Produces: `@traceability/monitor/react` exports `MonitorErrorBoundary`, `MonitorErrorBoundaryProps`, `useMonitorTag`

- [ ] **Step 1: Copy files**

```bash
cp packages/react/src/ErrorBoundary.tsx packages/monitor/src/react/ErrorBoundary.tsx
cp packages/react/src/hooks.ts packages/monitor/src/react/hooks.ts
cp packages/react/src/index.ts packages/monitor/src/react/index.ts
```

- [ ] **Step 2: Fix `hooks.ts` import — change from package ref to relative import**

`packages/monitor/src/react/hooks.ts`:
```diff
- import { setTag } from "@traceability/browser";
+ import { setTag } from "../browser/index.js";
```

- [ ] **Step 3: Commit**

```bash
git add packages/monitor/
git commit -m "feat(monitor): add react entry"
```

### Task 4: Copy Electron source

**Files:**
- Copy: `packages/electron/src/main/` → `packages/monitor/src/electron-main/`
- Copy: `packages/electron/src/renderer/` → `packages/monitor/src/electron-renderer/`

**Interfaces:**
- Produces: `@traceability/monitor/electron-main` exports `init`, `captureException`, `captureMessage`, `setUser`, `setTag`, `setContext`, `addBreadcrumb`, `withScope`, `flush`, `startResourceMonitor`, `sampleResources`, `getEnvironment`, and types. `@traceability/monitor/electron-renderer` exports same Sentry functions plus integrations from browser.

- [ ] **Step 1: Copy files**

```bash
cp packages/electron/src/main/index.ts packages/monitor/src/electron-main/index.ts
cp packages/electron/src/main/environment.ts packages/monitor/src/electron-main/environment.ts
cp packages/electron/src/renderer/index.ts packages/monitor/src/electron-renderer/index.ts
```

- [ ] **Step 2: Fix `electron-main/index.ts` — remove `createBearerTransport` export**

`packages/monitor/src/electron-main/index.ts`:
```diff
- export { createBearerTransport } from "@traceability/shared";
```

- [ ] **Step 3: Fix `electron-renderer/index.ts` — change from package ref to relative imports**

`packages/monitor/src/electron-renderer/index.ts`:
```diff
- export {
-   corsDiagnosticIntegration,
-   whiteScreenIntegration,
-   replayIntegration,
-   browserTracingIntegration,
- } from "@traceability/browser";
- export type { WhiteScreenOptions } from "@traceability/browser";
+ export {
+   corsDiagnosticIntegration,
+   whiteScreenIntegration,
+   replayIntegration,
+   browserTracingIntegration,
+ } from "../browser/index.js";
+ export type { WhiteScreenOptions } from "../browser/index.js";
```

- [ ] **Step 4: Commit**

```bash
git add packages/monitor/
git commit -m "feat(monitor): add electron-main and electron-renderer entries"
```

### Task 5: Remove old packages and update examples

**Files:**
- Delete: `packages/browser/`
- Delete: `packages/react/`
- Delete: `packages/electron/`
- Delete: `packages/shared/`
- Modify: `examples/web-demo/package.json`
- Modify: `examples/web-demo/src/traceability.ts`
- Modify: `examples/web-demo/src/register.ts`
- Modify: `examples/electron-demo/package.json`
- Modify: `examples/electron-demo/src/main.ts`
- Modify: `examples/electron-demo/renderer/src/renderer.ts`
- Modify: `examples/electron-demo/vite.renderer.config.ts`

- [ ] **Step 1: Remove old packages**

```bash
rm -rf packages/browser
rm -rf packages/react
rm -rf packages/electron
rm -rf packages/shared
```

- [ ] **Step 2: Update `examples/web-demo/package.json`**

```diff
  "dependencies": {
-   "@traceability/browser": "workspace:*"
+   "@traceability/monitor": "workspace:*"
  }
```

- [ ] **Step 3: Update `examples/web-demo/src/traceability.ts`**

```diff
- export { init } from "@traceability/browser";
+ export { init } from "@traceability/monitor";
```

- [ ] **Step 4: Update `examples/web-demo/src/register.ts`**

```diff
- } from "@traceability/browser";
+ } from "@traceability/monitor";
```

- [ ] **Step 5: Update `examples/electron-demo/package.json`**

Update build script and add monitor dependency:

```diff
  "scripts": {
-   "build:packages": "pnpm --filter @traceability/browser build && pnpm --filter @traceability/electron build",
+   "build:packages": "pnpm --filter @traceability/monitor build",
+   "dependencies": {
+     "@traceability/monitor": "workspace:*"
+   }
  }
```

Wait — electron-demo/package.json currently has no `dependencies` field, only `devDependencies`. We need to add it:

```json
  "dependencies": {
    "@traceability/monitor": "workspace:*"
  }
```

- [ ] **Step 6: Update `examples/electron-demo/src/main.ts`**

```diff
- import { init, startResourceMonitor } from "@traceability/electron/main";
+ import { init, startResourceMonitor } from "@traceability/monitor/electron-main";
```

- [ ] **Step 7: Update `examples/electron-demo/renderer/src/renderer.ts`**

```diff
- import { init } from "@traceability/electron/renderer";
+ import { init } from "@traceability/monitor/electron-renderer";
```

- [ ] **Step 8: Update `examples/electron-demo/vite.renderer.config.ts`**

The alias currently points to old path `packages/core/src/index.ts`. Update it:

```diff
-       "@traceability/browser": resolve(import.meta.dirname, "../../packages/core/src/index.ts"),
+       "@traceability/monitor": resolve(import.meta.dirname, "../../packages/monitor/src/browser/index.ts"),
```

- [ ] **Step 9: Verify build and tests**

```bash
pnpm install
pnpm --filter @traceability/monitor typecheck
pnpm --filter @traceability/monitor test
```

Expected: typecheck passes (zero errors), vitest tests pass.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "refactor: consolidate SDK into @traceability/monitor, remove old packages"
```
