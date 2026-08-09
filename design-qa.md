# Design QA: Agent long-error containment

## Visual truth

- Reference: `docs/design-qa/agent-error-reference.png`
- Implementation: `docs/design-qa/agent-error-after.png`
- Combined comparison: `docs/design-qa/agent-error-comparison.png`

## Matched state

- Session title and user prompt: `11`
- Assistant state: failed request with the same 5,602-character OpenCode 404 HTML response
- Scroll state: user prompt is above the viewport and the `Click to jump` sticky summary is active
- Layout state: wide Agent panel; message content uses the existing 720 CSS px maximum width
- Theme: the reference uses light tokens and the implementation capture uses the current saved dark theme. Color differences are therefore intentional; containment, wrapping, spacing, and sticky behavior are the comparison targets.

The reference is a 1932×1130 Retina raster supplied by the user. The implementation is a 1228×768 full-screen desktop capture produced by the local UI inspection service. Raster density differs, but both exercise the same 720 CSS px message boundary and equivalent sticky/error state.

## Root cause

`AssistantMessage` rendered `errorMessage` inside a danger block without a width or wrapping policy. A long HTML response with no reliable word boundaries expanded the text formatting context beyond the Agent panel. Ancestor `overflow-x-hidden` did not constrain the intrinsic width, so the error background, text, and scroll geometry escaped the intended column.

## Fix

- Constrained the assistant article with `min-w-0`, `max-w-full`, and `overflow-hidden`.
- Constrained the error block to the available width.
- Preserved response line breaks with `whitespace-pre-wrap`.
- Added `overflow-wrap:anywhere` so HTML, encoded SVG data, URLs, and other unbroken diagnostics wrap without widening the panel.
- Kept the existing typography, danger colors, message hierarchy, and sticky user summary.

## Comparison findings

- Reference: error content grows far beyond its intended column, creating a large blank/overflow region and visually detaching the highlighted content from the sticky summary.
- Implementation: every line stays inside the centered Agent message column; the danger border/background terminate at the same boundary as the input composer.
- The `11` sticky summary remains one line with `Click to jump` anchored at the right edge.
- The vertical scrollbar belongs to the message viewport and no horizontal overflow is visible.
- The long response remains readable and copyable; content was not truncated or altered.

## QA history

1. Initial source inspection incorrectly suspected the Issue source viewer because the screenshot contained HTML-like code. Searching the exact `Click to jump` label and danger styles identified the Agent conversation instead.
2. The first containment attempt targeted the user-message ProseMirror surface. Replaying the exact persisted session showed that the overflowing element was the assistant error fallback, so the exploratory change was removed.
3. Loaded the real persisted session, activated the sticky summary, and reproduced the 5,602-character error in the Electron renderer.
4. Applied the assistant error boundary fix, repeated the same wide-panel/full-screen state, and generated the combined comparison. No P0/P1/P2 visual findings remain.

final result: passed
