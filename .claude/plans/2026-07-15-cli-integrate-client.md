# Plan: Integrate `@traceability/client` into the CLI

## Goal

Replace the CLI's hand-rolled `lib/api.ts` (fetch-based, duplicates the server contract, stale Fastify comment) with the existing, type-safe, tested `@traceability/client` package so the CLI talks to the server through one shared client. Resolve the auth mismatch with a **pre-provisioned token** option on the client — no server changes, works with the auth-disabled MVP, backward-compatible with `login()`.

## Current state (verified)

- `packages/client/src/index.ts` — full typed client (`apps`/`issues`/`replays`/`performance`/`ingest`/`health`), axios-based, tested (5 passing). README says it's "intended for the CLI and desktop app". **Not imported by any consumer yet** (only its own tests/README).
- `packages/cli/src/lib/api.ts` — inline fetch wrapper, duplicates endpoints. Imported only by `commands/app.ts` + `commands/issue.ts`.
- `packages/cli/src/lib/config.ts` — stores `{ server, token }`; both required.
- Server has `/health` but **no `/api/auth/login`** (auth disabled for MVP). Server envelope is `{ code, data, timestamp, traceId? }`; `code: 0` = success.
- Client `request()` throws 401 if `requiresAuth && !this.token`; `login()` POSTs `/api/auth/login` (non-existent today, harmless when unused).
- Client `package.json` entrypoints all point to `./src/index.ts` (source). `client/dist` already builds (`tsc`).
- `@traceability/protocol` (type-only) is the only workspace runtime dep the CLI currently imports — it's erased at compile time, so the CLI's built `dist/index.js` works today. **`@traceability/client` has runtime code**, so importing it into the CLI's built `dist` requires the client to resolve to built JS at runtime.

## Auth decision (confirmed with user)

Pre-provisioned token: add optional `token` to `TraceabilityClientOptions`; CLI passes its stored static token. Server unchanged.

## Changes

### 1. `packages/client/src/index.ts` — add pre-provisioned token

- Add `token?: string` to `TraceabilityClientOptions`.
- Constructor: `this.token = options.token` (seed before any call).
- Leave the `requiresAuth && !this.token` guard and `login()` untouched → backward compatible.
- Add a test in `packages/client/tests/client.test.ts`: a client created with `{ baseUrl, token }` sends `Authorization: Bearer <token>` on the first request with no `login()`.

### 2. `packages/client/package.json` — dist runtime entrypoint (so the CLI's built binary resolves real JS)

```jsonc
"main": "./dist/index.js",
"types": "./src/index.ts",
"exports": {
  ".": {
    "types": "./src/index.ts",      // typecheck reads source — no build needed
    "import": "./dist/index.js"     // runtime (node dist / tsx) reads built JS
  }
}
```

- `types` → `src` keeps `pnpm type-check` (topological `tsc --noEmit`) working without a prior build.
- `import`/`main` → `dist` makes `node dist/index.js` and `tsx` resolve built JS.
- Update `packages/client/README.md`: document the `token` option + that a one-time `pnpm --filter @traceability/client build` is needed before running consumers (the root `pnpm build` already builds client before cli topologically).

### 3. `packages/cli/package.json` — add dependency

- Add `"@traceability/client": "workspace:*"` to `dependencies`.

### 4. `packages/cli/src/lib/client.ts` (new) — factory, replaces `api.ts`

```ts
import { createTraceabilityClient, type TraceabilityClient } from "@traceability/client";
import { getConfig } from "./config.js";

export function getClient(): TraceabilityClient {
  const { server, token } = getConfig();
  return createTraceabilityClient({ baseUrl: server, token });
}
```

### 5. Delete `packages/cli/src/lib/api.ts`

Only `commands/app.ts` + `commands/issue.ts` import it; both get rewritten.

### 6. `packages/cli/src/commands/app.ts` — rewrite onto client

- `const client = getClient();` then `client.apps.list() / get() / create({name, repoUrl, defaultBranch}) / update() / remove()`.
- Keep `--json` / table output and the `opts.branch → defaultBranch` mapping unchanged.

### 7. `packages/cli/src/commands/issue.ts` — rewrite onto client

- `list`: `client.issues.list({ appId, status: opts.status as IssueStatus | undefined, limit: Number(opts.limit) })` → use `res.items` for the table (`nextCursor` ignored, as today).
- `show`: `client.issues.get(issueId)`.
- `fix-request`: `client.issues.requestFix(issueId)`.
- `attach-patch`: `const issue = await client.issues.attachPatch(issueId, { branch, patch }); console.log(\`Patch attached: ${issue.id}\`)`(server returns the full`Issue`; `issue.id` preserves today's output).
- `mark-fixed`: `client.issues.markFixed(issueId)`.
- Import `type IssueStatus` from `@traceability/protocol` for the status cast.

### 8. `packages/cli/src/lib/config.ts` + `commands/config.ts` — unchanged

Config stays `{ server, token }`. `TraceabilityClientError extends Error`, so the top-level handler in `index.ts` (`err.message`) keeps working; error message format improves (server `message`/`traceId` surfaced).

## Out of scope

- Server `/api/auth/login` endpoint, account/password config — not added (auth disabled for MVP).
- Making CLI `--token` optional — config shape unchanged.
- New CLI tests — CLI has no test harness today; not adding one.
- Touching the app's consumption of the client (it doesn't import it yet).

## Verification

```bash
pnpm --filter @traceability/client typecheck && pnpm --filter @traceability/client test
pnpm --filter @traceability/client build                       # produce dist
pnpm --filter @traceability/cli typecheck
pnpm --filter @traceability/cli build                          # dist/index.js
# smoke (server already running on :3000, auth disabled):
#   pnpm --filter @traceability/cli exec tsx src/index.ts app list
#   pnpm --filter @traceability/cli exec tsx src/index.ts issue list --appId <id>
pnpm lint && pnpm format   # only on commit (husky), but run to be safe
```

Expect: client tests 6/6 pass; CLI typecheck + build clean; `app list` / `issue list` return data via the client against a running server.
