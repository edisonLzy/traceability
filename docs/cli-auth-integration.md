# CLI authentication integration

The CLI and Electron app authenticate management tRPC requests with user JWTs. Legacy `MANAGEMENT_AUTH_TOKEN`, `TRACEABILITY_MANAGEMENT_TOKEN`, and `--token` inputs are not supported.

## Server contract

Public procedures:

- `auth.login({ email, password })` returns `{ user, accessToken, refreshToken }`.
- `auth.refresh({ refreshToken })` rotates the refresh token and returns a replacement token pair.

Protected procedures require `Authorization: Bearer <accessToken>`. The access-token lifetime defaults to the server's `JWT_ACCESS_TOKEN_TTL_SECONDS`; refresh-token lifetime is controlled separately. There is no public registration procedure.

The development bootstrap account is `root@root.com` / `root@root.com`. Replace it before production use.

## CLI behavior

```bash
traceability auth login --server http://localhost:3000

printf '%s' "$TRACEABILITY_PASSWORD" \
  | traceability auth login --server http://localhost:3000 \
      --email engineer@example.com --password-stdin

traceability auth status --json
traceability auth logout
```

The CLI stores the server URL, saved user, access token, and refresh token in `~/.traceability/config.json` with mode `0600`. It never prints token values.

For a protected request, the CLI:

1. sends the current access token;
2. on the first 401, calls the public refresh procedure;
3. atomically persists the rotated token pair;
4. retries the original operation exactly once.

If refresh fails, it clears the local session. Interactive terminals may log in again; non-interactive callers receive exit code `2` and an `auth login` instruction.

## Security constraints

- Passwords for automation must arrive through `--password-stdin`, never command-line arguments.
- Refresh tokens are never sent as bearer tokens.
- Token values must not appear in stdout, logs, exception messages, or JSON output.
- Server deployments require a random `JWT_SECRET` of at least 32 characters. Changing it invalidates outstanding access tokens.
