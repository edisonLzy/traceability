# CLI authentication and CAC migration design

## Task

Replace the CLI's static management-token workflow with the server's user
access/refresh-token authentication contract, and replace Commander with CAC.
This is the first implementation slice of the wider AI-friendly CLI refactor.

## Scope

In scope:

- Replace `commander` with `cac` in `@traceability/cli`.
- Add `auth`, `auth login`, `auth status`, and `auth logout` commands.
- Persist the selected server, authenticated user, access token, and refresh
  token in the existing CLI configuration file.
- Send access tokens on protected tRPC and source-map requests; refresh once
  after a 401, persist the rotated pair atomically, and retry the original
  operation once.
- Remove the deprecated `app` command instead of retaining an alias.
- Remove CLI support for `MANAGEMENT_AUTH_TOKEN`, `TRACEABILITY_MANAGEMENT_TOKEN`,
  and the legacy `--token` option.

Out of scope:

- Adding user registration; the server exposes no registration procedure.
- Adding an online `whoami` endpoint; `auth status` reports the locally saved
  identity returned by a successful login.
- The project DSN/key command expansion. A project can have multiple active
  keys and therefore multiple DSNs. This needs a server connection-info
  contract based on `PUBLIC_INGEST_URL`, and will be specified separately.
- Redesigning every existing command's human/JSON output envelope or adding
  pagination and dry-run support. Existing `--json` behaviour is preserved in
  this slice; a follow-up will make it globally uniform.

## Verified baseline

- The CLI uses Commander 12 and registers `config`, `project`, `issue`, and
  `sourcemap` commands in `packages/cli/src/index.ts`.
- `project` still registers `app` as a deprecation alias.
- Configuration currently persists `{ server, token }`, permits a development
  token fallback, and reads token environment variables and global `--token`.
- `getTrpcClient()` performs implicit first-run credential prompting and
  automatically re-prompts after a protected request returns 401.
- The source-map uploader duplicates that same refresh-on-401 behaviour.
- The current workspace's `AppRouter` does not yet contain `auth`; the
  `feature/auth` worktree adds public `auth.login` and `auth.refresh` and
  changes protected procedures to expect an access JWT.

## Server contract

All calls use `<server>/api/trpc`.

```ts
auth.login.mutate({ email, password })
// => { user: { id, username, email }, accessToken, refreshToken }

auth.refresh.mutate({ refreshToken })
// => { accessToken, refreshToken }
```

`accessToken` is a 15-minute JWT by default. `refreshToken` is opaque, valid
for seven days by default, and rotates on every successful refresh: the prior
refresh token becomes invalid immediately. Protected requests use
`Authorization: Bearer <accessToken>`; a refresh token is never sent as a
Bearer credential. Server deployments use `JWT_SECRET`, not
`MANAGEMENT_AUTH_TOKEN`.

## Command contract

```text
traceability auth
traceability auth login [--server <url>] [--email <email>] [--password-stdin]
traceability auth status [--json]
traceability auth logout
```

- `auth` is the ergonomic shortcut required by the product request. If an
  identity and token pair are saved, it prints that user; otherwise it runs the
  interactive login flow in a TTY. In a non-TTY it prints an authentication
  instruction and exits 2.
- `auth login` is the deterministic interface for agents and scripts. It asks
  only for missing credentials in a TTY. Non-interactive callers must provide
  `--email` and pass the password through `--password-stdin`; a password flag
  is intentionally not supported, preventing exposure through shell history
  and process listings. Login validates through `auth.login`, saves the
  response, and prints the user without either token. It does not offer
  registration.
- `auth status` is always non-interactive. It reports the saved `{ id,
  username, email }`, server URL, and whether a token pair is present. Its
  `--json` result contains the same data. Since the server has no `whoami`, it
  labels the identity as locally stored rather than claiming a network-verified
  session.
- `auth logout` deletes only `accessToken`, `refreshToken`, and `user`; it
  preserves the configured server URL and succeeds even if no session exists.
- Existing `config` commands become server-only configuration. `config set`
  accepts `--server`; it no longer accepts or writes a token. `config show`
  never displays credentials.

## Configuration and credential storage

The configuration file remains `${TRACEABILITY_CONFIG_PATH ??
~/.traceability/config.json}` and mode `0600`. Its persisted shape becomes:

```ts
interface CliConfig {
  server: string;
  user?: { id: string; username: string; email: string };
  accessToken?: string;
  refreshToken?: string;
}
```

`TRACEABILITY_SERVER_URL` and global `--server` retain their existing
precedence over a stored server. No token environment-variable or command-line
override remains. A successful login or refresh writes a complete replacement
configuration through a same-directory temporary file followed by `rename`, so
the returned access/refresh pair cannot be partially persisted. Failed or
expired authentication clears the whole session pair and user atomically.

## Client and retry design

The CLI has two client boundaries:

1. A public auth client has no Bearer header and no retry wrapper. Only
   `auth.login` and `auth.refresh` use it.
2. A protected client supplies the current access token. Each terminal query
   and mutation may handle one `UNAUTHORIZED` failure by calling the public
   refresh client, atomically saving the returned pair, rebuilding the
   protected client, and retrying the original operation exactly once.

If no saved token pair exists, protected commands fail with a stable
authentication-required message and exit code 2. If refresh fails, the CLI
clears the session. In an interactive TTY it starts the login flow and then
retries the original operation once; in a non-interactive environment it
prints `Run: traceability auth login` and exits 2. No protected or public
operation can recursively retry.

The source-map uploader uses the same shared authentication helper rather than
maintaining a second 401 implementation.

Because the current workspace's exported `AppRouter` predates the auth router,
the public auth boundary is implemented against the documented RPC payloads
without relying on `AppRouter["auth"]`. This avoids a compile-time dependency
on the not-yet-merged server change. The existing typed protected client stays
in place and gains the new router type automatically when that dependency is
merged.

## CAC migration

`src/index.ts` creates a CAC instance, declares global `--server`, and
registers each command module against it. Command modules receive the CAC
command abstraction rather than Commander `Command`. The entry point parses
without immediately running, awaits the matched command, maps known
authentication failures to exit 2, maps user cancellation to 130, and writes
diagnostics to stderr.

The project, issue, and sourcemap command spellings and their existing
`--json` options stay compatible, except `traceability app ...` disappears.
`commander` is removed from the package manifest and `cac` plus
`@clack/prompts` are added. Clack is only used by the interactive auth flow;
non-interactive commands never open prompts.

## Resulting CLI structure

```text
packages/cli/src/
├── index.ts
├── commands/
│   ├── auth.ts                 # new
│   ├── config.ts               # server-only config
│   ├── project.ts              # CAC registration; no app alias
│   ├── issue.ts                # CAC registration
│   └── sourcemap.ts            # CAC registration
└── lib/
    ├── auth.ts                 # new: login, session lifecycle, prompts
    ├── config.ts               # new config shape and atomic persistence
    ├── trpc.ts                 # public/protected client boundaries and retry
    ├── upload.ts               # shared auth/retry behaviour
    └── output.ts
```

`config-interactive.ts` is removed after its responsibilities move to
`lib/auth.ts`.

## Acceptance criteria

1. The package contains CAC and no Commander dependency; all currently
   supported commands continue to parse through CAC, while `app` is unknown.
2. `auth login` accepts valid credentials, stores the server, user, and both
   tokens with restrictive permissions, and never prints a token.
3. `auth`, `auth status`, and `auth logout` satisfy their contracts above;
   `auth status --json` contains only non-secret session fields.
4. A protected tRPC request sends the access token, refreshes once after a
   401, atomically persists both new tokens, and retries exactly once.
5. Failed refresh removes stale session data; non-TTY exits 2 without a
   prompt, while TTY re-login can resume the original operation once.
6. Auth login/refresh have no protected retry wrapper, so an invalid refresh
   token cannot recurse.
7. Source-map upload follows the same one-refresh rule.
8. CLI unit tests cover command parsing, missing credentials, public login,
   token rotation persistence, exactly-once retry, failed refresh, logout,
   token redaction, and legacy-command removal.
