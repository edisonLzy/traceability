# 0004: Agent tool names are flat snake_case

The Electron app's agent sends tool definitions to an OpenAI-compatible model
gateway (the DeepSeek provider at `opencode.ai/zen/go`). The gateway rejects the
whole request when any tool name does not match `^[a-zA-Z0-9_-]+$`, and the app's
built-in tools were named `fs/read_text_file`, `terminal/create`, and
`subagents/run` — a single `/` in one tool name failed every request with 400.

We adopt **flat snake_case for every tool name in the agent tool registry**:
`fs_read_text_file`, `terminal_create`, `subagents_run`, and so on. Extension
tools already followed this convention (`list_projects`, `list_issues`,
`get_issue`); the three built-in and subagent tools were renamed to match. The
slash-separated names survive only in prose (the subagent system prompt) and in
the history of old sessions.

We considered sanitizing `/` to `_` at the provider boundary instead of renaming
the tools, and rejected it: `pi-ai` serializes tool names verbatim with no
sanitization hook, and rewriting the name at the boundary would desync the name
advertised to the model from the name the tool dispatcher matches on execution.
Renaming the tools keeps one name that is both sent to the gateway and used to
route execution.

A future provider with a permissive name check would not justify reintroducing
`/` — the registry should stay uniform.
