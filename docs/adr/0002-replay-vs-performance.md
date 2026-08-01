# 0002: Replay and Performance are distinct concepts

The app surfaced Replay recordings under a "performance" route and specs treated
them as one feature. They are different things and should stay separate:

- **Replay** is a *session recording* of the user's browser interaction (rrweb
  data), stored as Replay Sessions composed of Replay Segments and served by the
  `replays` module.
- **Performance** is *timing metrics*: named durations from `reportPerformance`
  and browser web vitals (FCP, LCP, CLS, INP, TTFB), carried in transaction
  items. The server has no dedicated performance module yet — these ride through
  the generic event pipeline.

We use the two terms precisely and do not conflate them. Replays are triaged as
session data; performance metrics are aggregate timing signals. They feed
different app surfaces (Replay → Explorer; Performance → its own view) and will
get separate storage and processing as they grow.

Conflating them couples a latency signal with a heavy blob pipeline. Keeping
them separate lets each evolve its own lifecycle (Replays have retention and
deletion; metrics aggregate).
