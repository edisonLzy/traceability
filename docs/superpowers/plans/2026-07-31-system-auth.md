# System Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add root-only password login and rotating JWT authentication to Traceability's desktop app and API.

**Architecture:** Adapt neon-server's auth design into the current Fastify/tRPC application. The server owns users, JWT validation and rotated refresh tokens; Electron's main process owns encrypted session persistence; the renderer owns login presentation and request retry coordination.

**Tech Stack:** TypeScript, Fastify, tRPC 11, Drizzle/PostgreSQL, Redis, bcryptjs, jsonwebtoken, Electron `safeStorage`, React 19, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-31-system-auth-design.md`

## Global Constraints

- Do not modify `packages/cli` code.
- Use `pnpm`, ESM `.js` relative import specifiers, `import type` for type-only imports, strict TypeScript, and Conventional Commit messages.
- Existing management procedures accept JWT access tokens only; registration is neither exposed nor rendered.
- Root credentials are only the fixed initial migration seed: `root@root.com` / `root@root.com`.

## File structure

- Add `server/src/modules/auth/{schema,repository,service,router,token}.ts` and focused unit tests.
- Update database exports, configuration, tRPC context/middleware, root router, migration metadata, and dependencies.
- Add `app/src/main/auth-session.ts`, IPC contracts/handler, renderer auth provider, client link, login page, and tests.
- Add `docs/cli-auth-integration.md` without modifying CLI sources.

### Task 1: Server auth persistence and token primitives

- [ ] Write failing Vitest coverage for valid/invalid JWT verification and access-token expiry semantics.
- [ ] Add auth schema, `JWT_SECRET` configuration, bcrypt/JWT dependencies, and a Drizzle migration that creates `auth` tables plus idempotent root seed.
- [ ] Implement password hashing, JWT sign/verify, refresh token generation/hash, and run the focused tests to green.

### Task 2: Server auth procedures and authorization

- [ ] Write failing tests for login validation, invalid credential rejection, refresh token rotation, and rejection of an old/static bearer token.
- [ ] Implement auth repository/service/router from the neon-server model and register `auth` in the root tRPC router.
- [ ] Replace management-token middleware with JWT user middleware, carrying `user` in context; run server tests and typecheck.

### Task 3: Electron token persistence and IPC

- [ ] Write failing main-process tests for encrypted token save/load/clear and unavailable-encryption behavior.
- [ ] Implement `AuthSession` using `safeStorage` and userData, then add narrowly scoped login/restore/clear IPC events and startup registration.
- [ ] Run focused app tests and app typecheck.

### Task 4: Renderer auth gate, login UI, and retrying client

- [ ] Write failing tests for unauthenticated login gating, successful login, and a single 401 refresh/retry.
- [ ] Implement an auth provider, tRPC client token/refresh coordination, and an app-style dark login page with no registration control.
- [ ] Gate the existing application shell on restored authentication; run app tests and typecheck.

### Task 5: Documentation and full verification

- [ ] Write `docs/cli-auth-integration.md` describing the new login and refresh tRPC contracts, JWT bearer expectation, and an implementation sequence for the currently paused CLI work; explicitly state that CLI source is unchanged.
- [ ] Run `pnpm --filter @traceability/server test`, `pnpm --filter @traceability/app test`, both package type checks, root lint, and both builds.
- [ ] Review the migration, rendered login UI, and final diff against the approved spec; send the CLI document to task `019fb62a-a1e8-7040-aa67-2d0e7dc7ce77`.
