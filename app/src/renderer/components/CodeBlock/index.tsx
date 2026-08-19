import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

import { loadLanguageExtension } from "./language-from-path";

export interface CodeBlockProps {
  /** Source text. Newlines are preserved. */
  code: string;
  /**
   * Optional language key. Accepts a CodeMirror language id (`"js"` / `"ts"` /
   * `"python"` / `"markdown"` / `"json"` / `"css"`), a full filename
   * (`"foo.tsx"`), or an alias (`"typescript"` → `"ts"`).
   */
  language?: string;
  /** Real starting line number for the first line of `code`. Defaults to 1. */
  startLine?: number;
  /** Show the line-number gutter. Defaults to true. */
  showLineNumbers?: boolean;
  /** Max height of the scrollable region. Defaults to "360px". */
  maxHeight?: string;
  className?: string;
}

/**
 * Read-only code block. Built on a slim subset of CodeMirror 6 — only the
 * language pack, syntax highlight style, line numbers, and a theme that
 * pulls colors from the app's CSS variables. Selection works (so the user
 * can copy) but no editing, search, history, or other full-editor features.
 */
export function CodeBlock({
  code,
  language,
  startLine = 1,
  showLineNumbers = true,
  maxHeight = "360px",
  className,
}: CodeBlockProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let view: EditorView | null = null;
    let cancelled = false;

    const mount = (langExtensions: Extension[] | undefined) => {
      if (cancelled) return;
      const host = hostRef.current;
      if (!host) return;
      view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: code,
          extensions: buildExtensions({
            langExtensions,
            startLine,
            showLineNumbers,
            maxHeight,
          }),
        }),
      });
    };

    const langPromise = loadLanguageExtension(language);
    if (langPromise) {
      langPromise.then(mount);
    } else {
      mount(undefined);
    }

    return () => {
      cancelled = true;
      view?.destroy();
    };
  }, [code, language, startLine, showLineNumbers, maxHeight]);

  return (
    <div
      ref={hostRef}
      aria-label="Code block"
      className={className ?? "cm-shell overflow-hidden rounded-sm border border-hairline"}
    />
  );
}

interface BuildExtensionsArgs {
  langExtensions: Extension[] | undefined;
  startLine: number;
  showLineNumbers: boolean;
  maxHeight: string;
}

function buildExtensions({
  langExtensions,
  startLine,
  showLineNumbers,
  maxHeight,
}: BuildExtensionsArgs): Extension[] {
  return [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    highlightSpecialChars(),
    ...(showLineNumbers
      ? [
          lineNumbers({ formatNumber: (n: number) => String(startLine + n - 1) }),
          highlightActiveLineGutter(),
        ]
      : []),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.theme({
      "&": {
        maxHeight,
        backgroundColor: "var(--code-bg)",
        color: "var(--code-text)",
        fontSize: "11px",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "var(--font-mono)",
        lineHeight: "1.72",
      },
      ".cm-content": { padding: "8px 0 14px" },
      ".cm-line": { padding: "0 14px" },
      ".cm-gutters": {
        backgroundColor: "var(--code-bg)",
        color: "var(--code-line-number)",
        borderRight: "1px solid var(--hairline)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "44px",
        padding: "0 10px 0 8px",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--foreground)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "color-mix(in srgb, var(--primary) 24%, transparent)",
      },
      ".cm-cursor": { display: "none" },
      "&.cm-focused": { outline: "none" },
    }),
    ...(langExtensions ?? []),
  ];
}
