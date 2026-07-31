# Web project setup reference

Target: any non-electron web project (vanilla Vite, React+Vite, Next, Nuxt, …). Golden reference: `examples/web-demo`.

## Dependencies

Add to the target package's `package.json` (monorepo-internal, `workspace:*`):

- `@traceability/core` - required.
- `@traceability/react` - only if the project is React (provides `MonitorErrorBoundary` + hooks; re-exports core).

Then run `pnpm install` at the repo root.

## Environment variables

Create `.env.local` (Vite exposes only `VITE_`-prefixed vars via `import.meta.env`). The skill fills the first two; **the user fills the token**:

```env
VITE_TRACEABILITY_DSN=http://localhost:3000
VITE_TRACEABILITY_APP_ID=<project.sentryProjectId from project create>
VITE_TRACEABILITY_TOKEN=<user fills: API token from the server admin>
```

> `.env.local` must be in `.gitignore` - the token must not be committed.

## Monitor module

Create `src/traceability.ts` (dedicated module, keeps the entry clean):

```ts
import { init } from "@traceability/core";

export function initTraceability() {
  init({
    dsn: import.meta.env.VITE_TRACEABILITY_DSN,
    appId: import.meta.env.VITE_TRACEABILITY_APP_ID,
    token: import.meta.env.VITE_TRACEABILITY_TOKEN,
    environment: import.meta.env.MODE,
    // release: import.meta.env.VITE_APP_VERSION, // set if you version your builds
    replay: { enabled: true, maxDurationMs: 60_000 },
  });
}
```

`init()` builds its ingest URL from `${dsn}/api/ingest/envelope/${appId}`, so `dsn` is the server base URL with no trailing path.

## Entry wiring

Call once at app entry (`src/main.ts` / `src/main.tsx`):

```ts
import { initTraceability } from "./traceability";
initTraceability();
```

## If this is a React project (error boundaries)

Install `@traceability/react`. Wrap route-level components and micro-app roots with `MonitorErrorBoundary`:

```tsx
import { MonitorErrorBoundary } from "@traceability/react";

<MonitorErrorBoundary appName="message-module" fallback={<ErrorUI />}>
  <MessageApp />
</MonitorErrorBoundary>;
```

Props:

- `appName?` - tags captured errors with the owning module (useful in micro-frontends).
- `fallback` - a `ReactNode`, or a render prop `({ error, componentStack, resetError }) => ReactNode`.
- `onError?` - `(error: Error, componentStack: string | null) => void`.

Recommended placement:

- One boundary around each route-level component.
- One boundary around each micro-app root.
- Optionally one around flaky subtrees (third-party widgets).

Verify: throw inside the wrapped component in dev; confirm an issue appears in the Inbox and the fallback UI renders.

## Verify the setup

Run the project and trigger one event:

```ts
import { captureException } from "@traceability/core";
captureException(new Error("traceability setup check"));
```

Confirm it appears in the Inbox UI, or via the CLI:

```bash
traceability issue list --project-id <projectId>
```
