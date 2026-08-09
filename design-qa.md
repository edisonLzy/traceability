**Source visual truth**

- `docs/prototypes/issue-workspace-v2.html`
- Detail source capture: `/private/tmp/traceability-issue-qa-source-normalized.png`
- Implementation capture: `/private/tmp/traceability-issue-qa-implementation-normalized.png`
- Combined comparison: `/private/tmp/traceability-issue-qa-comparison-normalized.png`
- Focused stack source: `/private/tmp/traceability-issue-qa-stack-source.png`
- Focused stack implementation: `/private/tmp/traceability-issue-qa-stack-implementation.png`
- Issue list implementation: `/private/tmp/traceability-issue-qa-list.png`

**Capture normalization**

- State: light theme, Issue detail with latest event selected; list with all statuses selected.
- Target content width: 598 CSS px, matching the prototype's narrow content region at roughly half of the main window.
- Detail source and implementation were normalized to 598 × 643 px at 1× before comparison. Shared workspace chrome was excluded from the source crop because `_layout.tsx` and Agent Panel are outside this task and unchanged.
- The implementation was browser-rendered from the production Issue page/components with API-shaped local data. The app's shared Electron shell was not duplicated in the QA harness.
- No raster imagery exists in the target content. Existing Lucide icons and Traceability color/type tokens were retained.

**Findings**

- No actionable P0/P1/P2 visual differences remain.
- The implementation preserves the prototype's one-module-per-row hierarchy, compact header, two-column overview cells, horizontal occurrence selector, evidence-card rhythm, radii, hairlines, status treatments, and narrow-width wrapping behavior.
- Typography uses the existing Traceability font stack and weights. The title remains two-line clamped in detail, while list titles are single-line ellipsized at a fixed 58 px row height.
- Colors map to existing app tokens. The CodeMirror body uses the app's light-theme code tokens rather than forcing the prototype's always-dark code canvas; the dark resolved/generated location bars retain the intended source-view separation.
- Copy differences are intentional and data-honest: real UUID/fingerprint/date values are shown; Occurrences includes occurred/received timestamps; Replay explains the current missing viewer route instead of presenting a non-working playback control.
- Focused stack comparison confirms selectable frame tabs, explicit resolved/generated locations, line highlighting, restored source context, and equivalent information density.

**Primary interactions tested**

- Selected a different occurrence and verified that event ID, evidence, and Replay association update together.
- Switched stack frames and verified CodeMirror source, line/column, and generated location update.
- Expanded Raw event payload and verified the JSON is visible.
- Opened the Base UI status Select and filtered to Resolved, then restored All statuses.
- Searched for the long RangeError title and verified one result.
- Verified the long title's hover content, full `title`, and descriptive `aria-label`.
- Measured the filtered list row at exactly 58 px; measured title `scrollWidth > clientWidth` with `text-overflow: ellipsis` and `white-space: nowrap`.
- Verified there is no native `<select>` and no browser console errors in either detail or list flows.

**Comparison history**

1. Initial implementation capture found one P2 behavior issue: CodeMirror's initial `scrollIntoView` effect scrolled the enclosing Issue page directly to Stack trace on load.
2. Removed the page-affecting scroll effect and recaptured at the same state. The page now opens at Issue overview with `scrollTop: 0`; no P0/P1/P2 findings remain.

**Follow-up polish**

- P3: When a first-class Replay viewer route is added, replace the explanatory limitation with a real playback action and time offset.
- P3: Historical events processed before sourcemap context enrichment will correctly show the source-context unavailable state until reprocessed.

**Implementation checklist**

- [x] One top-level module per row at narrow width.
- [x] Real event selection refreshes all evidence modules.
- [x] Read-only CodeMirror source surface with selectable frames.
- [x] Stable Issue list rows, accessible full-title hint, Base UI Select.
- [x] Focus, selected, empty, error, raw, and unavailable-data states represented.
- [x] Browser console checked and targeted tests run.

final result: passed
