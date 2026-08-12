# 0001: The frontend capture SDK is the Monitor

Status: Accepted

The frontend capture SDK is packaged as `@tracerability/monitor`. It exposes browser, React, Electron main, Electron renderer, and Electron preload entry points.

We use **Monitor** as the canonical term for the SDK and the capture capabilities it ships. `core` and `@tracerability/core` are historical names and must not appear in current setup instructions, examples, skills, or architecture diagrams.

The package boundary is intentionally explicit: “monitor” describes capture and runtime observation, while “core” does not communicate a product responsibility. Future entry points belong under `@tracerability/monitor/*` unless an ADR establishes a separate package boundary.
