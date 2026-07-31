# System Authentication — Design

**Date:** 2026-07-31  
**Status:** Approved for implementation

## Goal

Add password authentication to the Traceability desktop app and replace the server's static management-token protection with authenticated user JWTs. Registration is intentionally unavailable. The initial database contains only `root@root.com` / `root@root.com`.

## Scope

- Adapt the authentication model from `/Users/evan/Desktop/coding/neon-server/packages/auth-service`: bcrypt password verification, short-lived JWT access tokens, hashed refresh tokens, Redis cache, and rotation.
- Add `auth.login` and `auth.refresh` public tRPC mutations and protect existing management procedures with JWT bearer authentication.
- Add a dark, desktop-native login screen and persistent Electron session handling with automatic refresh and one 401 retry.
- Add a CLI integration guide only. Do not change any `packages/cli` source or tests.

## Server contracts

```ts
type AuthenticatedUser = {
  id: string;
  username: string;
  email: string;
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

auth.login({ email, password }): { user: AuthenticatedUser } & AuthTokens;
auth.refresh({ refreshToken }): AuthTokens;
```

- Access tokens are HS256 JWTs with `{ userId, username, email }` payload and a 15-minute lifetime.
- Refresh tokens are 32-byte random hex strings, persisted only as SHA-256 hashes, and expire after seven days.
- A refresh invalidates its presented token and creates a replacement token in the same family.
- Login and refresh failure use `UNAUTHORIZED` without disclosing whether an email exists.
- Every existing `procedure` requires `Authorization: Bearer <access token>`; `publicProcedure` is reserved for authentication mutations.

## Data model

The migration creates an `auth` PostgreSQL schema with:

- `auth.users(id, username, email, password_hash, created_at, updated_at)`.
- `auth.refresh_tokens(id, token_hash, user_id, family_id, expires_at, created_at)`.

It idempotently inserts user UUID `00000000-0000-4000-8000-000000000001`, username `root`, email `root@root.com`, and the bcrypt hash for password `root@root.com`. It must use `ON CONFLICT (email) DO NOTHING`.

## Configuration and security

- Add `JWT_SECRET`, requiring at least 32 characters and mandatory in production.
- `JWT_EXPIRES_IN_SECONDS` defaults to `900`; refresh TTL is 604800 seconds.
- Remove `MANAGEMENT_AUTH_TOKEN` from server and app runtime behavior. The CLI remains untouched and therefore requires the supplied integration guidance before it can authenticate to the new server.
- Electron uses `safeStorage` to encrypt the serialized token pair before storing it under `app.getPath("userData")/auth-session.bin`. If encryption is unavailable, session persistence is disabled rather than writing plaintext refresh tokens.

## Desktop behavior

- Renderer starts from an auth gate. It calls main-process IPC to restore a session; a valid refresh result renders the existing application shell, otherwise it renders the login page.
- The login page contains an email input, password input, submit state, generic invalid-credentials error, and explicit copy that registration is not available.
- Renderer sends only credentials to `auth.login` and token-pair update requests to main-process IPC. The main process owns persisted tokens.
- The renderer client attaches the current access token, refreshes before expiry, serializes concurrent refreshes, and retries a 401 request once. Any refresh failure clears the persisted session and returns to the login page.

## Verification

- Unit tests cover JWT verification and required-procedure authorization.
- Auth service tests cover login rejection/success and refresh rotation with an in-memory repository boundary.
- Main-process tests cover encrypted session persistence and fallback when encryption is unavailable.
- Renderer tests cover unauthenticated gate and login form behavior.
- Run server and app test suites, type checks, lint, and production builds. Inspect the final diff against this document.

