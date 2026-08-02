# traceability-diagnose-issue

Walks a coding agent through diagnosing a Traceability issue and producing a patch.

## When it triggers

- "诊断 issue abc123"
- "fix issue <id>"
- "investigate this error"

## Files

- `SKILL.md` — workflow
- `scripts/fetch-issue.sh` — wrapper that calls `traceability issue show --json`
