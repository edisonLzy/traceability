# 0003: The CLI uses Commander, not CAC

The CLI was migrated from Commander to CAC (`6276c1c`) and back to Commander
(`2128f7b`) while adding user auth sessions. The `auth`, `auth login`, `auth
status`, and `auth logout` commands and the refresh-once/retry-once session
logic all ship on Commander.

We adopt **Commander** as the CLI framework and do not migrate to CAC. Commands
are registered as a nested `Command` tree — `project` → `list` / `create` /
`show` / `update` / `remove`, `issue` → `list` / `show` / `fix-request` /
`attach-patch` / `mark-fixed`, `auth` → `login` / `status` / `logout` — and the
entry point relies on Commander's `optsWithGlobals()` plus a `preAction` hook
for the global `--server` override, and on `exitOverride()` with
`CommanderError` to map exit codes (parse and auth errors → 2, user cancel →
130).

CAC was rejected because it models subcommands as flat string names with no
parent/child `Command` tree, so nested help output and global-option inheritance
are weaker; and its `CACError` has no exit-code field, which makes precise
exit-status mapping awkward. The auth/session/retry design is
framework-independent, so this choice can be revisited without touching the
session persistence or refresh logic.
