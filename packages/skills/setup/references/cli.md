# @traceability/cli reference

The `traceability` CLI manages CLI configuration, projects, and issues. It reads credentials from `~/.traceability/config.json` (written by `config set`); project/issue commands do **not** take a `--token` flag.

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

## Configuration

### `config set --server <url> --token <token>`

Stores `{ server, token }` to `~/.traceability/config.json` (mode `0600`). Run once to "log in". Required before any other command works.

### `config show`

Prints the stored config. The `server` line is the SDK `dsn` (the server base URL). The token is masked.

```text
server: http://localhost:3000
token:  dev-…
```

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

Fetches one project. Use to validate a user-provided project id.

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
