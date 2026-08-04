# traceability-trace

Teaches a coding agent how to instrument an entire **user flow / 链路** end-to-end. The agent analyzes the codebase itself to map the flow and find the key positions, so the user does not have to trace the code by hand.

## When it triggers

- "给登录流程加埋点 / 排查用户登录链路"
- "instrument the checkout flow end-to-end"
- "I want to see every step of <flow> in the Inbox"

## Scope

- **Whole flow / 链路** - the user names a flow; the agent reads the code, maps the chain, and instruments **every key position** along it. (This is what this skill does.)
- **Single call site** - if you only need one function instrumented, treat it as a one-step flow: an entry `addBreadcrumb` plus success/error `captureMessage` calls.

## Files

- `SKILL.md` - workflow the agent follows (analyze -> map key positions -> instrument -> verify -> commit)
- `references/reporting-api.md` - how to use the `@tracerability/monitor` reporting methods in a flow context
