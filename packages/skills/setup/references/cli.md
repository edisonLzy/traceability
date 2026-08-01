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

Creates a project. With `--json`, prints the project record and generated key.

```json
{
  "project": {
    "id": "e4eac53d-846d-4c75-a6a0-402c15c69954",
    "sentryProjectId": "7f2d4b1c9a6e4f1082d3c4b5a6e7f809",
    "slug": "my-app",
    "name": "My App",
    "platform": "javascript",
    "enabled": true
  },
  "dsn": "http://localhost:3000"
}
```

> Required: `--slug` and `--name`. The response contains both a management `project.id` and an ingest `project.sentryProjectId`.

### `project list [--json]`

Lists projects. Use to discover an existing project's `id`.

### `project show <projectId> [--json]`

Fetches one project with its DSN connection collection. Use to validate a
user-provided project id and to look up a project's keys and DSNs.

### `project update <projectId> [--name <n>] [--enabled <boolean>]`

Updates a project's metadata.

### `project remove <projectId>`

Deletes a project.

## Issues (verification after setup)

### `issue list --project-id <id> [--limit <n>] [--json]`

Lists issues for a project. `--project-id` is **required**. Use after setup to confirm events are arriving.

### `issue show <issueId> [--json]`

Fetches one issue (stacktrace, message, context).

### `issue fix-request <issueId>` / `issue attach-patch <issueId>` / `issue mark-fixed <issueId>`

These commands are reserved for the future fix loop and currently exit with status `2`.
