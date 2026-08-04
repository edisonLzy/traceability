# 0005: @sentry/electron stays on 7.16.0 (its own version line)

`@traceability/monitor` depends on `@sentry/browser`, `@sentry/core`, and
`@sentry/react` at `^10.69.0`, which can look inconsistent with
`@sentry/electron` pinned at `^7.16.0`. This is not a lag. `@sentry/electron`
has its own version line that is independent of the Sentry JS SDK: its npm
`latest` is 7.16.0 (the 5.x line is still in beta), so there is no 10.x of
`@sentry/electron` to upgrade to. The 7.x is the shell package version; the
engine it wraps is already 10.x — `@sentry/electron@7.16.0` depends on
`@sentry/browser`, `@sentry/core`, and `@sentry/node` at 10.67.0. We keep
7.16.0 as the current release and do not chase a parallel 10.x that does not
exist.

We considered aligning the Monitor's direct JS SDK deps down to 10.67.0 so the
whole dependency tree holds a single Sentry version, and rejected it as
needless churn: the two versions coexist because `@sentry/electron` pins its
internal JS SDK for compatibility by design. A future reader who sees 10.69.0
next to 7.16.0 should know the gap is expected, not an oversight to "fix".
