# Traceability CLI

The CLI talks to the protected server management API through tRPC.

```bash
traceability config set --server http://localhost:3000 --token <token>
traceability project list
traceability project create --slug checkout-web --name "Checkout Web"
traceability issue list --project-id <project-id>
```

Configuration precedence is `--server` / `--token`, then
`TRACEABILITY_SERVER_URL` / `TRACEABILITY_MANAGEMENT_TOKEN`, then
`~/.traceability/config.json`, then the development defaults.

The legacy `app` command is a temporary alias for `project`. The fix-loop
commands (`issue fix-request`, `issue attach-patch`, and `issue mark-fixed`)
remain reserved and return exit code `2` until the server implements them.
