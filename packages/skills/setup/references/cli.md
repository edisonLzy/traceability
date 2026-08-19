# @tracerability/cli reference

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
pnpm --filter @tracerability/cli exec traceability <command> ...
# or
node packages/cli/dist/index.js <command> ...
```

> If `dist/` is stale, build first: `pnpm --filter @tracerability/cli build`.

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

## Issues

### `issue list --project-id <id> [--limit <n>] [--json]`

Lists issues for a project. `--project-id` is **required**. Use after setup to confirm events are arriving. Default `--limit` is 20.

### `issue show <issueId> [--json]`

Fetches one issue row: `id`, `projectId`, `title`, `type`, `status`, `eventCount`, `firstSeen`, `lastSeen`.

### `issue events <issueId> [--limit <n>] [--json]`

Lists the raw event payloads captured under an issue. Without `--json`, prints a table with `eventId`, `eventTimestamp`, `receivedAt`, `level`, `environment`, `release`. With `--json`, dumps the complete rows including the original Sentry event payload (stacktrace frames, `tags`, `extra`, `breadcrumbs`). `--limit` accepts 1–100, default 20.

### `issue fix-request <issueId>` / `issue attach-patch <issueId>` / `issue mark-fixed <issueId>`

Reserved for a future fix loop. Currently exit with status `2` and print `"<action> is not available on this server (v1)"`.

## Metrics

### `metric list --project-id <id> [--prefix <p>] [--type <t>] [--from <t>] [--to <t>] [--limit <n>] [--readable] [--json]`

Lists all metric names in the catalog for a project. Filters: `--prefix` (name prefix), `--type` (`counter|gauge|distribution`), time range (`--from`/`--to` accept relative values like `1h`, `30m`, or ISO timestamps). `--readable` prints a human-friendly table; `--json` (default) outputs JSON. Supports `--cursor` pagination.

### `metric series --project-id <id> --name <name> [options]`

Queries time-series data for a named metric. `--type` and `--unit` can be omitted when the metric resolves unambiguously in the catalog. Key options:

| Option | Default | Description |
|---|---|---|
| `--resolution <res>` | `1h` | Bucket size: `1m`, `5m`, `1h`, `1d` |
| `--from` / `--to` | — | Time range (relative or ISO) |
| `--attr <k=v>` | — | Attribute equality filter (repeatable, max 10) |
| `--group-by <attr>` | — | Group by attribute value; returns aggregate table instead of time buckets |
| `--order-by <col>` | `count` | Sort groups by `count|sum|min|max|avg|latest|p50|p95|p99` |
| `--order-asc` | — | Ascending order (default descending) |
| `--limit <n>` | `50` | Max groups (group-by mode) |
| `--readable` | — | Human-readable summary + table |
| `--trace-id` / `--span-id` | — | Scope to a specific trace/span |

`counter` series returns `points[{ bucket, sum }]` + `summary.sum`.  
`gauge` returns `points[{ bucket, latest, min, max, avg }]`.  
`distribution` returns `points[{ bucket, count, sum, min, max, avg, p50, p95, p99 }]`.

## Traces

### `trace list --project-id <id> [options]`

Lists traces for a project. Key options: `--name`, `--op`, `--status`, `--environment`, `--release`, `--from`/`--to` (relative or ISO), `--cursor` (pagination), `--limit` (default 50), `--readable` (table output). Default output is JSON.

### `trace show <traceId> --project-id <id> [--readable]`

Fetches a trace snapshot with its span tree. With `--readable`, renders a nested tree showing duration, status, op, and name per span, plus a summary of linked events and metrics count. Without `--readable`, outputs full JSON.

## Graph (Explorer evidence graphs)

### `graph list --project-id <id> [--json]`

Lists all evidence graphs in a project (id, title, status, node/edge count, updatedAt).

### `graph show <graphId> --project-id <id> [--json]`

Shows a graph snapshot: title, status, version, node and edge counts. With `--json`, returns the full snapshot including all node and edge arrays.

### `graph create --project-id <id> --title <title> [--json]`

Creates a new empty graph.

### `graph rename <graphId> --project-id <id> --title <title> [--json]`

Renames an existing graph.

### `graph archive <graphId> --project-id <id> [--json]`

Archives a graph.

### `graph node list <graphId> --project-id <id> [--type <kind>] [--json]`

Lists nodes in a graph, optionally filtered by type: `question|finding|issue|event|replay|code|document`.

### `graph node show <graphId> <nodeId> --project-id <id> [--json]`

Shows a single node and all edges connected to it.

### `graph node add <graphId> --project-id <id> --type <kind> [type-specific options] [--json]`

Adds a node. Node-type-specific options:

| Type | Required options | Optional options |
|---|---|---|
| `question` | `--prompt` | `--intent` |
| `finding` | `--summary` | `--confidence 0–1`, `--status open\|confirmed\|rejected` |
| `issue` | `--issue-id` | — |
| `event` | `--event-id` | — |
| `replay` | `--replay-id` | — |
| `code` | `--path` | `--start-line`, `--end-line`, `--language`, `--snippet` |
| `document` | `--doc-title` | `--path`, `--excerpt` |

### `graph node remove <graphId> <nodeId> --project-id <id>`

Removes a node and all its connected edges.

### `graph edge add <graphId> --project-id <id> --source <nodeId> --target <nodeId> --relation <rel> [--json]`

Connects two nodes. Valid relations: `investigates`, `supports`, `contradicts`, `caused_by`, `implemented_by`, `observed_in`, `related_to`.

### `graph edge remove <graphId> <edgeId> --project-id <id>`

Removes an edge.
