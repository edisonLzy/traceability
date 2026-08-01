# Traceability CLI

The CLI manages Traceability projects, issues, source maps, and a local user
session for the protected tRPC management API.

```bash
# Interactive login
traceability auth login --server http://localhost:3000

# Safe for automation: password arrives on stdin, never in argv
printf '%s' "$TRACEABILITY_PASSWORD" \
  | traceability auth login --server http://localhost:3000 \
      --email engineer@example.com --password-stdin

traceability project create --slug checkout-web --name "Checkout Web" --json
traceability project show <project-id> --json
traceability issue list --project-id <project-id> --json
```

## Authentication

`auth login` calls the server's public `auth.login` procedure and stores the
server URL, user identity, access token, and refresh token in
`~/.traceability/config.json` with mode `0600`. It never prints either token.

- `traceability auth` prints the saved user when a session exists; otherwise it
  starts an interactive login in a TTY.
- `traceability auth status --json` reports the saved identity and session
  state without exposing credentials.
- `traceability auth logout` removes the user and both tokens but retains the
  selected server URL.
- In a non-interactive environment, pass `--email` and `--password-stdin` to
  `auth login`. There is intentionally no `--password` option.

Protected requests send the access token. A 401 triggers one public token
refresh and one retry of the original operation. Refresh tokens rotate, so the
CLI atomically persists the returned pair. If refresh fails, the local session
is cleared; a TTY can log in again, while a non-TTY exits with status `2` and
an `auth login` instruction.

The selected server comes from `--server`, then `TRACEABILITY_SERVER_URL`, then
the stored configuration, then `http://localhost:3000`. The legacy
`MANAGEMENT_AUTH_TOKEN`, `TRACEABILITY_MANAGEMENT_TOKEN`, and `--token` inputs
are not supported.

## Projects and DSNs

`project create` returns `{ project, key, dsn }` with `--json`, and its human
output includes the first DSN. Projects can have multiple keys, so the full
key/DSN list lives in the `connections` collection returned by `project show
<project-id>`.

The removed `traceability app` alias is not supported. Use `project` directly.
The fix-loop commands (`issue fix-request`, `issue attach-patch`, and `issue
mark-fixed`) remain reserved and return exit code `2` until the server
implements them.
