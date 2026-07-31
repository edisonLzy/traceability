# CLI authentication integration

The server no longer accepts the legacy `MANAGEMENT_AUTH_TOKEN`. Its management tRPC procedures now require a user access JWT in `Authorization: Bearer <accessToken>`.

This document is intentionally the only CLI deliverable in this change: no `packages/cli` source has been modified.

## Server contracts

All calls use the existing tRPC endpoint: `POST <server>/api/trpc`.

### Login

Call the public mutation `auth.login` with:

```ts
{ email: string; password: string }
```

For this release the only seeded account is:

```text
root@root.com
root@root.com
```

The result is:

```ts
{
  user: { id: string; username: string; email: string };
  accessToken: string;   // JWT, 15 minutes by default
  refreshToken: string;  // opaque token, 7 days by default
}
```

There is no `auth.register` procedure and the CLI must not offer registration.

### Refresh

Call the public mutation `auth.refresh` with:

```ts
{ refreshToken: string }
```

It returns a replacement `{ accessToken, refreshToken }` pair. Refresh tokens rotate: once a refresh succeeds, the old refresh token is invalid and both returned values must be persisted atomically.

## Recommended CLI implementation

1. Replace the current static-token prompt with email and password fields. Keep the server URL configuration untouched.
2. On successful `auth.login`, store `{ accessToken, refreshToken }` in the existing CLI config file with mode `0600`; do not print either token.
3. The tRPC client adds `Authorization: Bearer ${accessToken}` to every protected request.
4. Before a protected request whose access token is near expiry, call `auth.refresh`; alternatively, on the first 401 call `auth.refresh`, update config, and retry the original operation exactly once.
5. If refresh fails, clear stored tokens and re-prompt for email/password in an interactive TTY. In CI/non-TTY, print a re-authentication instruction and exit with code 2.
6. Never retry an operation more than once, and never send a refresh token as a bearer token.

## tRPC client shape

```ts
let tokens = await loadAuthTokens();

async function refresh() {
  const next = await publicClient.auth.refresh.mutate({ refreshToken: tokens.refreshToken });
  tokens = next;
  await saveAuthTokens(tokens);
}

const client = createTRPCClient<AppRouter>({
  links: [
    retryOnceAfter401(refresh),
    httpBatchLink({
      url: `${server}/api/trpc`,
      headers: () => ({ authorization: `Bearer ${tokens.accessToken}` }),
    }),
  ],
});
```

The `auth.login` and `auth.refresh` client must be constructed without the protected retry link; otherwise an expired refresh token can recursively trigger refresh attempts.

## Migration notes

- Remove environment-variable and config references to `TRACEABILITY_MANAGEMENT_TOKEN` after switching to user tokens.
- Server deployments must set `JWT_SECRET` to a random value of at least 32 characters. Changing it invalidates all access tokens; users can log in again.
- The root credentials are a bootstrap account only. Rotate or replace them before production use.
