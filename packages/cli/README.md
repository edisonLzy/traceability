# Traceability CLI

The CLI talks to the protected server management API through tRPC.

```bash
traceability config set --server http://localhost:3000 --token <token>
traceability project list
traceability project create --slug checkout-web --name "Checkout Web"
traceability issue list --project-id <project-id>
```

## First run

The first time you invoke a command that talks to the server (for example
`traceability project list`), the CLI notices there is no configuration
yet and interactively asks for the server URL and management token. Your
answers are written to `~/.traceability/config.json` (`0600`) and the
original command continues.

If the server later rejects the stored token (HTTP 401 / tRPC
`UNAUTHORIZED`), the CLI prompts you to re-enter your credentials once and
transparently retries the request against the new values.

Non-interactive environments (CI, redirected stdin, etc.) never see a
prompt. Instead the CLI reports `management authentication required` and
exits with status `2`, so you can inject credentials via
`traceability config set`, `--server` / `--token`, or the
`TRACEABILITY_MANAGEMENT_TOKEN` environment variable.

If the token was supplied through `TRACEABILITY_MANAGEMENT_TOKEN`, a 401
response also skips the prompt: the env value expresses external intent
and the CLI refuses to silently overwrite it — unset the variable if you
want to re-authenticate interactively.

Configuration precedence is `--server` / `--token`, then
`TRACEABILITY_SERVER_URL` / `TRACEABILITY_MANAGEMENT_TOKEN`, then
`~/.traceability/config.json`, then the development defaults.

The legacy `app` command is a temporary alias for `project`. The fix-loop
commands (`issue fix-request`, `issue attach-patch`, and `issue mark-fixed`)
remain reserved and return exit code `2` until the server implements them.
