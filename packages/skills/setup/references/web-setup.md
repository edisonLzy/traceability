# Web project setup reference

Target: any non-electron web project (vanilla Vite, React+Vite, Next, Nuxt, …). Golden reference: `examples/web-demo`.

## Dependencies

Add to the target package's `package.json` (monorepo-internal, `workspace:*`):

```jsonc
"@traceability/monitor": "workspace:*"
```

No separate React package — `@traceability/monitor/react` ships inside the same package. Then run `pnpm install` at the repo root.

## Environment variables

Create `.env.local` (Vite exposes only `VITE_`-prefixed vars via `import.meta.env`). The skill fills the DSN; it is the **only** credential:

```env
VITE_TRACEABILITY_DSN=http://<publicKey>@<server>/<sentryProjectId>
VITE_RELEASE=<app>@<commit>   # optional, stamped on every event
```

> `.env.local` must be in `.gitignore` — the DSN's public key must not be committed.

## Monitor module

Create `src/traceability.ts` (dedicated module, keeps the entry clean). Modeled on `examples/web-demo/src/traceability.ts`:

```ts
import { init } from "@traceability/monitor";

export function initTraceability(): void {
  const dsn = import.meta.env.VITE_TRACEABILITY_DSN as string | undefined;
  if (!dsn) {
    console.warn("[traceability] VITE_TRACEABILITY_DSN is not set; monitoring disabled.");
    return;
  }
  init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_RELEASE as string | undefined) ?? undefined,
  });
}
```

`init` accepts the full Sentry `BrowserOptions`, so the usual browser SDK options (`tracesSampleRate`, `replay`, custom `integrations`, …) work too. The default integration set already includes a CORS diagnostic, a white-screen detector, and replay.

## Entry wiring

Call once at app entry (`src/main.ts` / `src/main.tsx`):

```ts
import { initTraceability } from "./traceability";
initTraceability();
```

## If this is a React project (error boundaries)

Use the `./react` subpath of the same package. Wrap route-level components and micro-app roots with `MonitorErrorBoundary`:

```tsx
import { MonitorErrorBoundary } from "@traceability/monitor/react";

<MonitorErrorBoundary appName="message-module" fallback={<ErrorUI />}>
  <MessageApp />
</MonitorErrorBoundary>;
```

Props:

- `appName?` - tags captured errors with the owning module (useful in micro-frontends).
- `fallback` - a `ReactNode`, or a render prop `({ error, componentStack, resetError }) => ReactNode`.
- `onError?` - `(error: Error, componentStack: string | null) => void`.

Also exported: `useMonitorTag()` (returns a `(key, value) => void` callback that calls `setTag`).

Recommended placement:

- One boundary around each route-level component.
- One boundary around each micro-app root.
- Optionally one around flaky subtrees (third-party widgets).

Verify: throw inside the wrapped component in dev; confirm an issue appears in the Inbox and the fallback UI renders.

## Sourcemaps (so production stacks symbolicate)

Add `@sentry/vite-plugin` (devDep) and wire it into `vite.config.ts` in **inject-only** mode (stamps a `debug_id` into each chunk, no upload to Sentry.io), plus the companion plugin from `examples/web-demo/vite-plugins/debug-id-sourcemap.ts` that mirrors that debug_id into the paired `.map`. See `examples/web-demo/vite.config.ts` for the full config. Then upload:

```bash
pnpm build
traceability sourcemap upload --project <slug> --dist ./dist
```

## Verify the setup

Run the project and trigger one event:

```ts
import { captureException } from "@traceability/monitor";
captureException(new Error("traceability setup check"));
```

Confirm it appears in the Inbox UI, or via the CLI:

```bash
traceability issue list --project-id <projectId>
```
