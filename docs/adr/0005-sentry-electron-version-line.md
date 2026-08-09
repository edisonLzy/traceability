# 0005: Sentry Electron follows its own version line

Status: Accepted

`@tracerability/monitor` currently declares `@sentry/browser`, `@sentry/core`, and `@sentry/react` on the 10.x line while `@sentry/electron` is on the 7.x line. Those package majors are not expected to align: the Electron shell package has its own release line and constrains the compatible Sentry JS packages internally.

We therefore do not downgrade browser packages or search for a matching Electron major solely to make the dependency list look uniform. A future Electron upgrade should be evaluated from its release notes, resolved dependency tree, Monitor tests, and Electron demo—not by matching major numbers.

The exact declared versions remain authoritative in `packages/monitor/package.json` and the resolved versions in `pnpm-lock.yaml`; this ADR records the compatibility decision rather than a claim about the latest registry release.
