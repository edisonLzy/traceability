# Traceability

Traceability connects frontend error capture to an AI-assisted fix loop. Frontend code sends event and session data to the server; the server aggregates events into issues, and operators triage them from the CLI and the Electron app.

## Language

### Capture

**Monitor**:
The frontend error-capture SDK (`@tracerability/monitor`). The browser/Electron entry points that record events, breadcrumbs, and performance metrics.
_Avoid_: core, core SDK, client, agent

**Instrument**:
To add Monitor reporting calls to application code, making a user flow observable end-to-end.
_Avoid_: trace, track

**Flow**:
A named end-to-end user journey (login, checkout, send-message) that has been instrumented. Every event in one flow carries a shared `flow` tag; its step names are `<flow>-<step>`.
_Avoid_: 链路 (when used for the instrumented concept), pipeline, journey

**Event**:
A single discrete occurrence reported to the server — an error, a message, or a custom-typed step in a flow. The unit that issues aggregate from.
_Avoid_: report, log entry

**Breadcrumb**:
A lightweight "what just happened" note that rides along on the next error event. It does not create an issue by itself.
_Avoid_: log, step

**Replay**:
A session recording of a user's browser interaction (rrweb data), captured as a Replay Session composed of Replay Segments. Distinct from Performance.
_Avoid_: session recording, performance capture, screen recording

**Performance**:
Timing metrics reported by the Monitor — named durations and browser web vitals (FCP, LCP, CLS, INP, TTFB). Carried in transaction items. Distinct from Replay.
_Avoid_: replay (when referring to metrics), traces, telemetry

### Server-side model

**Project**:
A logical application whose frontend is instrumented with the Monitor. Owns Project Keys, a Project Policy, and everything ingested and aggregated under it. Identified by its Slug and by an integer Sentry Project ID.
_Avoid_: app, application, workspace, organization

**Slug**:
The immutable, globally unique, URL-friendly identifier of a Project (lowercase `[a-z0-9][a-z0-9-]{0,62}`). Set once at creation and never updated; the CLI requires it explicitly rather than deriving it from the Name. Not what a DSN carries — that is the Sentry Project ID.
_Avoid_: name, project id, sentry project id

**Name**:
The mutable, human-readable display name of a Project (up to 200 characters of arbitrary text). Not unique and never used to reference a Project.
_Avoid_: slug, title

**Sentry Project ID**:
The integer, DSN-visible identifier of a Project, matching the path component Sentry SDKs expect in a DSN. Not the Project's UUID.
_Avoid_: project id (when the UUID is meant)

**Project Key**:
The credential a Project's Monitor uses to authenticate ingestion. A public-key string paired with a DSN; status is active, disabled, or revoked.
_Avoid_: dsn, api key, token, public key (alone)

**DSN**:
The connection string handed to `init()` that encodes the ingest URL, the Project Key, and the Sentry Project ID. Also the CLI's shorthand for the Project's key-and-DSN connection.
_Avoid_: endpoint, URL, connection

**Project Policy**:
The per-Project rules applied at ingest: allowed origins, rate limit, enabled item types, and scrubbing rules.
_Avoid_: config, settings

**Envelope**:
The Sentry-compatible request body sent by the Monitor. A header plus a sequence of Envelope Items.
_Avoid_: payload, batch, request

**Envelope Item**:
One typed entry inside an Envelope — an event, transaction, client report, session, attachment, replay event, or replay recording.
_Avoid_: record, entry

**Issue**:
A group of Events sharing the same fingerprint, representing one recurring problem in a Project. Status is unresolved, resolved, or ignored. The unit operators triage.
_Avoid_: bug, ticket, incident, error group, problem

**Fingerprint**:
The hash that decides which Events group into one Issue, derived from the error type, normalized message, and in-app stack frames.
_Avoid_: hash, grouping key

**Replay Session**:
One recorded browser session: the events and recordings from a single visit, composed of ordered Replay Segments.
_Avoid_: replay (when the whole session is meant), session

**Replay Segment**:
One ordered piece of a Replay Session's recording data.
_Avoid_: chunk, slice

**Source Map Artifact**:
An uploaded `.map` file, keyed by debug ID, used to symbolicate minified stack frames back to readable source.
_Avoid_: sourcemap, map file

**Debug ID**:
The identifier that binds a Source Map Artifact to the JavaScript bundles that reference it, and which the symbolicator resolves.
_Avoid_: build id, release id

### Management and the fix loop

**Management API**:
The tRPC interface (`/api/trpc`) that the CLI and the Electron app use to manage Projects and triage Issues. Authenticated separately from ingestion.
_Avoid_: admin API, internal API

**Fix Loop**:
The AI-assisted workflow that inspects an Issue, proposes a patch, and tracks whether the fix shipped.
_Avoid_: fix workflow, agent loop

**Session**:
A persisted assistant conversation in the Electron app — the durable record of one Agent run, with a project context.
_Avoid_: conversation (when the persisted record is meant), thread

**Agent**:
The AI assistant runtime in the Electron app that operates on an Issue within a Session.
_Avoid_: bot, assistant, model

**Inbox**:
The Electron app's triage view for Issues awaiting attention.
_Avoid_: queue, worklist

**Explorer**:
The Electron app's view for browsing captured data (Replays, Performance) beyond the triage surface.
_Avoid_: browser, console

### Ingestion pipeline

**Ingest**:
The process of receiving an Envelope, validating it against the Project's key and Policy, and persisting it for processing.
_Avoid_: receive, intake, collect

**Disposition**:
The per-item outcome recorded at ingest — pending, ignored, invalid — which decides whether an item is processed further.
_Avoid_: state, status (when the pipeline stage is meant)

**Processing**:
The background stage that symbolicates stack frames, derives Event fields, fingerprints, and aggregates Events into Issues.
_Avoid_: aggregation (alone), normalization

**Scrubbing**:
Redacting sensitive values (passwords, tokens, keys) from envelope data before it is persisted.
_Avoid_: sanitizing, redaction (as the primary term)
