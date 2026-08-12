import { javascript } from "@codemirror/lang-javascript";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

import type { StackFrame } from "./event-data";

export function SourceCodeViewer({ frame }: { frame: StackFrame }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const context = frame.context;
    if (!host || !context) return;

    const doc = context.lines.join("\n");
    const errorDocLine = context.errorLine - context.startLine + 1;
    const validErrorLine = errorDocLine >= 1 && errorDocLine <= context.lines.length;
    const lineDecoration = validErrorLine
      ? Decoration.set([
          Decoration.line({ attributes: { class: "cm-trace-error-line" } }).range(
            EditorState.create({ doc }).doc.line(errorDocLine).from,
          ),
        ])
      : Decoration.none;

    const isTypeScript = /\.(?:ts|tsx)(?:$|[?#])/i.test(frame.file);
    const isJsx = /\.(?:jsx|tsx)(?:$|[?#])/i.test(frame.file);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          highlightSpecialChars(),
          lineNumbers({
            formatNumber: (lineNumber) => String(context.startLine + lineNumber - 1),
          }),
          highlightActiveLineGutter(),
          EditorView.decorations.of(lineDecoration),
          EditorView.theme({
            "&": {
              minHeight: "270px",
              maxHeight: "330px",
              backgroundColor: "var(--code-bg)",
              color: "var(--code-text)",
              fontSize: "11px",
            },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: "var(--font-mono)",
              lineHeight: "1.72",
            },
            ".cm-content": { padding: "10px 0 18px" },
            ".cm-line": { padding: "0 18px" },
            ".cm-gutters": {
              backgroundColor: "var(--code-bg)",
              color: "var(--code-line-number)",
              borderRight: "1px solid var(--hairline)",
            },
            ".cm-lineNumbers .cm-gutterElement": {
              minWidth: "44px",
              padding: "0 10px 0 8px",
            },
            ".cm-trace-error-line": {
              backgroundColor: "color-mix(in srgb, var(--primary) 14%, transparent)",
            },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              backgroundColor: "color-mix(in srgb, var(--primary) 24%, transparent)",
            },
            ".cm-cursor": { display: "none" },
            "&.cm-focused": { outline: "none" },
          }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          ...(isTypeScript || /\.(?:js|jsx|mjs|cjs)(?:$|[?#])/i.test(frame.file)
            ? [javascript({ typescript: isTypeScript, jsx: isJsx })]
            : []),
        ],
      }),
    });

    return () => view.destroy();
  }, [frame]);

  if (!frame.context) {
    return (
      <div className="grid min-h-[180px] place-items-center bg-code-bg px-6 text-center font-mono text-[10px] leading-6 text-code-line-number">
        Original source context was not included in this event or its uploaded source map.
      </div>
    );
  }

  return <div ref={hostRef} aria-label="Restored source code" className="bg-code-bg" />;
}
