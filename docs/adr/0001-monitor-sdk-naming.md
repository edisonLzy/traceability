# 0001: The frontend capture SDK is the Monitor

The frontend capture SDK is packaged as `@traceability/monitor` and exposed to
application code as `init` / `captureException` / `report` / `reportPerformance`
/ `setApp`. Docs, skills, and specs still call it "core" or the "core SDK".

We adopt **Monitor** as the canonical term for the SDK and everything that ships
in it. `core` remains a historical name: the skills still import from
`@traceability/core`, so the package rename must land before the docs can
follow. Until then, code should say Monitor and docs may keep `core` only as the
literal package name.

The package was renamed once already (core → monitor); keeping "core" as the
spoken name would let the drift grow back. The SDK is a boundary — the canonical
name for a boundary should be obvious to new readers, and "monitor" describes
what it does while "core" describes nothing.
