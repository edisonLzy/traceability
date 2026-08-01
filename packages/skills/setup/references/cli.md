# @traceability/cli reference

The `traceability` CLI manages a local user session, projects, and issues. It
stores the selected server, user, access token, and rotating refresh token in
`~/.traceability/config.json` (mode `0600`); project/issue commands do not
take a token flag.

## Invocation

If `traceability` is on your PATH:

```bash
traceability <command> ...
```

Fallbacks inside this monorepo (the bin is `packages/cli/dist/index.js`):

```bash
pnpm --filter @traceability/cli exec traceability <command> ...
# or
node packages/cli/dist/index.js <command> ...
```

> If `dist/` is stale, build first: `pnpm --filter @traceability/cli build`.

## Authentication

### `auth login [--server <url>] [--email <email>] [--password-stdin]`

Logs in through the public `auth.login` procedure and writes the user plus an
access/refresh token pair to `~/.traceability/config.json`. The CLI never
prints the tokens. In a TTY, missing email/password values are prompted. In a
non-TTY, pass `--email` and send the password through standard input with
`--password-stdin`; there is no password option.

### `auth status [--json]`

Prints the selected server and locally saved identity without exposing token
values. It does not claim an online-verified session because the server has no
`whoami` procedure.

### `auth logout`

Removes the stored user and token pair while retaining the selected server.

### `config set --server <url>` / `config show`

Stores or prints only the selected management server URL. Credentials belong to
the `auth` commands.

## Projects

### `project create --slug <slug> --name <name> [--json]`

Creates a project. With `--json`, prints the project record, the generated key, and the DSN.

```json
{
  "project": {
    "id": "e4eac53d-846d-4c75-a6a0-402c15c69954",
    "sentryProjectId": 1,
    "slug": "my-app",
    "name": "My App",
    "platform": "javascript",
    "enabled": true
  },
  "key": {
    "id": "c10e4b32-…",
    "publicKey": "71d1744709c6987397c068d3f2ec4827",
    "status": "active",
    "createdAt": "…",
    "lastUsedAt": null,
    "revokedAt": null
  },
  "dsn": "http://71d1744709c6987397c068d3f2ec4827@127.0.0.1:3000/1"
}
```

> Required: `--slug` and `--name`. Use `project.id` for management commands. The **full `dsn`** (public key in its username, `sentryProjectId` in its path) is what the SDK config needs — the SDK has no separate `appId`/`token` options.

### `project list [--json]`

Lists projects. Use to discover an existing project's `id`.

### `project show <projectId> [--json]`

Fetches one project with its DSN connection collection. Use to validate a
user-provided project id and to look up a project's keys and DSNs.

### `project update <projectId> [--name <n>] [--enabled <boolean>]`

Updates a project's metadata.

### `project remove <projectId>`

Deletes a project.

## Sourcemaps

### `sourcemap upload --project <slug> --dist <dir> [--concurrency <n>] [-s, --select] [--yes]`

Scans a build output directory and uploads every `.js.map` file that carries a top-level `debug_id` field. Required: `--project` (the project **slug**, not id) and `--dist` (directory to scan recursively). `--concurrency` defaults to 4; `--select` prompts interactively to pick maps; `--yes` skips the picker even with `--select`.

The maps must be stamped with a `debug_id` at build time — see `examples/web-demo/vite.config.ts` + `vite-plugins/debug-id-sourcemap.ts` for the Vite setup. Uploaded maps let the server symbolicate production stack traces.

## Issues (verification after setup)

### `issue list --project-id <id> [--limit <n>] [--json]`

Lists issues for a project. `--project-id` is **required**. Use after setup to confirm events are arriving.

### `issue show <issueId> [--json]`

Fetches one issue (stacktrace, message, context).

### `issue fix-request <issueId>` / `issue attach-patch <issueId>` / `issue mark-fixed <issueId>`

These commands are reserved for the future fix loop and currently exit with status `2`.
