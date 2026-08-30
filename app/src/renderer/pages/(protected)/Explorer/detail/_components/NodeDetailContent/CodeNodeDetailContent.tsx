import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, type Extension, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  lineNumbers,
} from "@codemirror/view";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { Check, ChevronDown, ChevronUp, Code2, Copy, FileCode, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { CodeNodeData } from "../../../types";

/** CodeMirror theme adapting to Traceability's CSS design tokens */
const codeMirrorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--code-bg, #0d1527)",
    color: "var(--code-text, #dbe6ff)",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: "12px",
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "var(--primary, #4f77ff)",
  },
  ".cm-line": {
    padding: "0 16px 0 12px",
    lineHeight: "1.65",
  },
  ".cm-gutters": {
    backgroundColor: "var(--code-gutter-bg, #090f1d)",
    borderRight: "1px solid var(--hairline, rgba(86, 119, 174, 0.16))",
    color: "var(--code-line-number, #5e739c)",
    minWidth: "48px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 12px 0 8px",
    textAlign: "right",
    userSelect: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(79, 119, 255, 0.08)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(79, 119, 255, 0.12)",
    color: "var(--primary, #4f77ff)",
    fontWeight: "bold",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(79, 119, 255, 0.3) !important",
  },
});

/** Decoration for focus / error lines */
const focusErrorDecoration = Decoration.line({
  attributes: {
    class: "cm-focus-error-line bg-destructive/15 border-l-2 border-destructive",
  },
});

const focusWarningDecoration = Decoration.line({
  attributes: {
    class: "cm-focus-warning-line bg-warning/15 border-l-2 border-warning",
  },
});

const focusInfoDecoration = Decoration.line({
  attributes: {
    class: "cm-focus-info-line bg-primary/15 border-l-2 border-primary",
  },
});

/** Language loader mapping common file extensions */
type LanguageLoader = () => Promise<Extension | Extension[]>;

const LANGUAGE_MAP: Record<string, LanguageLoader> = {
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  tsx: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ jsx: true, typescript: true }),
    ),
  json: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
};

function resolveLanguage(lang?: string, path?: string): string | undefined {
  if (lang) {
    const l = lang.toLowerCase();
    if (l in LANGUAGE_MAP) return l;
    if (l === "javascript") return "js";
    if (l === "typescript") return "ts";
    if (l === "react" || l === "jsx") return "jsx";
    if (l === "tsx") return "tsx";
  }
  if (path) {
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext && ext in LANGUAGE_MAP) return ext;
  }
  return undefined;
}

async function loadLanguageExtension(langKey?: string): Promise<Extension[]> {
  if (!langKey || !LANGUAGE_MAP[langKey]) return [];
  try {
    const loader = LANGUAGE_MAP[langKey];
    if (!loader) return [];
    const ext = await loader();
    return Array.isArray(ext) ? ext : [ext];
  } catch (error) {
    console.warn("Failed to load CodeMirror language pack:", error);
    return [];
  }
}

export interface CodeNodeDetailContentProps {
  data: CodeNodeData;
  className?: string;
}

export function CodeNodeDetailContent({ data, className }: CodeNodeDetailContentProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const rawSnippet = data.snippet ?? "";
  const startLine = data.startLine ?? 1;
  const lineCount = useMemo(() => {
    if (!rawSnippet) return 0;
    return rawSnippet.split("\n").length;
  }, [rawSnippet]);
  const endLine = data.endLine ?? startLine + Math.max(0, lineCount - 1);

  const resolvedLang = useMemo(
    () => resolveLanguage(data.language, data.path),
    [data.language, data.path],
  );

  // Copy Path action
  const copyPath = useCallback(() => {
    if (!data.path) return;
    void navigator.clipboard.writeText(data.path);
    setCopiedPath(true);
    toast.success("File path copied");
    setTimeout(() => setCopiedPath(false), 2000);
  }, [data.path]);

  // Copy Snippet action
  const copySnippet = useCallback(() => {
    if (!rawSnippet) return;
    void navigator.clipboard.writeText(rawSnippet);
    setCopiedSnippet(true);
    toast.success("Code snippet copied");
    setTimeout(() => setCopiedSnippet(false), 2000);
  }, [rawSnippet]);

  // Build Focus Decoration Extension
  const focusDecorationExtension = useMemo(() => {
    if (!data.focusRange) return [];

    const { startLine: focusStart, endLine: focusEnd, severity = "error" } = data.focusRange;
    const relStartLine = Math.max(1, focusStart - startLine + 1);
    const relEndLine = Math.max(relStartLine, focusEnd - startLine + 1);

    const deco =
      severity === "error"
        ? focusErrorDecoration
        : severity === "warning"
          ? focusWarningDecoration
          : focusInfoDecoration;

    const field = StateField.define<DecorationSet>({
      create(state) {
        const decos = [];
        const maxLines = state.doc.lines;
        for (let i = relStartLine; i <= Math.min(relEndLine, maxLines); i++) {
          const line = state.doc.line(i);
          decos.push(deco.range(line.from));
        }
        return Decoration.set(decos);
      },
      update(decos, tr) {
        return decos.map(tr.changes);
      },
      provide: (f) => EditorView.decorations.from(f),
    });

    return [field];
  }, [data.focusRange, startLine]);

  // Initialize CodeMirror 6 Editor
  useEffect(() => {
    const host = editorHostRef.current;
    if (!host) return;

    let view: EditorView | null = null;
    let cancelled = false;

    void loadLanguageExtension(resolvedLang).then((langExtensions) => {
      if (cancelled || !editorHostRef.current) return;

      const extensions: Extension[] = [
        lineNumbers({
          formatNumber: (n) => String(startLine + n - 1),
        }),
        codeMirrorTheme,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        ...focusDecorationExtension,
        ...langExtensions,
      ];

      const state = EditorState.create({
        doc: rawSnippet || "// No code snippet text available.",
        extensions,
      });

      view = new EditorView({ state, parent: editorHostRef.current });
      viewRef.current = view;
    });

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [rawSnippet, resolvedLang, startLine, focusDecorationExtension]);

  // Search logic
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !rawSnippet) {
      setSearchMatches([]);
      setActiveMatchIndex(0);
      return;
    }
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches: number[] = [];
    let match;
    while ((match = regex.exec(rawSnippet)) !== null) {
      matches.push(match.index);
    }
    setSearchMatches(matches);
    setActiveMatchIndex(matches.length > 0 ? 1 : 0);

    if (matches.length > 0 && viewRef.current) {
      const pos = matches[0];
      if (typeof pos === "number") {
        viewRef.current.dispatch({
          effects: EditorView.scrollIntoView(pos, { y: "center" }),
          selection: { anchor: pos, head: pos + query.length },
        });
      }
    }
  };

  const navigateSearch = (direction: "next" | "prev") => {
    if (searchMatches.length === 0 || !viewRef.current) return;
    let nextIndex =
      direction === "next"
        ? (activeMatchIndex % searchMatches.length) + 1
        : ((activeMatchIndex - 2 + searchMatches.length) % searchMatches.length) + 1;

    setActiveMatchIndex(nextIndex);
    const pos = searchMatches[nextIndex - 1];
    if (typeof pos === "number") {
      viewRef.current.dispatch({
        effects: EditorView.scrollIntoView(pos, { y: "center" }),
        selection: { anchor: pos, head: pos + searchQuery.length },
      });
    }
  };

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filename = data.path ? data.path.split("/").pop() : "Untitled";

  return (
    <div className={cn("flex flex-col flex-1 h-full min-h-0 bg-card select-text", className)}>
      {/* Top File & Symbol Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-muted/20 px-4 py-2.5 shrink-0">
        {/* Left: Path Breadcrumb & Symbol Metadata */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileCode className="size-4 shrink-0 text-primary" />
          <div className="flex items-center gap-1.5 truncate font-mono text-xs">
            <span className="font-bold text-ink truncate" title={data.path}>
              {filename}
            </span>
            {data.path && (
              <span
                className="text-[10px] text-tertiary truncate hidden sm:inline"
                title={data.path}
              >
                ({data.path})
              </span>
            )}
          </div>

          {/* Symbol Tag (Function / Component Name) */}
          {data.symbolName && (
            <div className="flex items-center gap-1 shrink-0 rounded-[3px] border border-ink/40 bg-signal-purple/15 px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
              <span className="text-primary">
                {data.symbolType === "component" ? "⚛" : data.symbolType === "hook" ? "⚓" : "ƒ"}
              </span>
              <span>{data.symbolName}</span>
            </div>
          )}
        </div>

        {/* Right: Badges & Quick Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Line Range Badge */}
          <span className="rounded-[3px] border border-ink/30 bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
            L{startLine} - L{endLine}
            {lineCount > 0 && ` (${lineCount} lines)`}
          </span>

          {/* Language Badge */}
          {data.language && (
            <span className="rounded-[3px] border border-ink/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-primary">
              {data.language}
            </span>
          )}

          {/* Copy File Path */}
          <Button
            className="h-7 border border-ink/40 bg-card px-2 font-mono text-[10px] font-bold text-ink hover:bg-muted"
            onClick={copyPath}
            size="sm"
            title="Copy File Path"
            type="button"
          >
            {copiedPath ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            <span className="hidden md:inline">Path</span>
          </Button>

          {/* Copy Code Snippet */}
          <Button
            className="h-7 border border-ink/40 bg-card px-2 font-mono text-[10px] font-bold text-ink hover:bg-muted"
            onClick={copySnippet}
            size="sm"
            title="Copy Code Snippet"
            type="button"
          >
            {copiedSnippet ? (
              <Check className="size-3 text-success" />
            ) : (
              <Code2 className="size-3" />
            )}
            <span>Copy</span>
          </Button>

          {/* Search Toggle */}
          <Button
            className={cn(
              "h-7 size-7 p-0 border border-ink/40 bg-card font-mono text-ink hover:bg-muted",
              isSearchOpen && "bg-primary text-primary-foreground hover:bg-primary",
            )}
            onClick={() => setIsSearchOpen((prev) => !prev)}
            size="sm"
            title="Search in snippet (⌘F)"
            type="button"
          >
            <Search className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Embedded Search Bar */}
      {isSearchOpen && (
        <div className="flex items-center justify-between border-b border-ink/20 bg-muted/40 px-4 py-1.5 shrink-0 animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              className="h-6 w-full rounded border border-ink/30 bg-card px-2 font-mono text-xs text-ink placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Find in snippet..."
              value={searchQuery}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] text-tertiary">
              {searchQuery
                ? searchMatches.length > 0
                  ? `${activeMatchIndex}/${searchMatches.length}`
                  : "No matches"
                : ""}
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                className="h-6 size-6 p-0"
                disabled={searchMatches.length === 0}
                onClick={() => navigateSearch("prev")}
                size="sm"
                title="Previous match"
                type="button"
                variant="ghost"
              >
                <ChevronUp className="size-3" />
              </Button>
              <Button
                className="h-6 size-6 p-0"
                disabled={searchMatches.length === 0}
                onClick={() => navigateSearch("next")}
                size="sm"
                title="Next match"
                type="button"
                variant="ghost"
              >
                <ChevronDown className="size-3" />
              </Button>
            </div>
            <Button
              className="h-6 size-6 p-0"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery("");
                setSearchMatches([]);
              }}
              size="sm"
              title="Close search"
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* CodeMirror 6 Editor Container */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-code-bg">
        <div ref={editorHostRef} className="h-full w-full overflow-hidden" />
      </div>

      {/* Bottom Status / Meta Bar */}
      <div className="flex h-7 items-center justify-between border-t border-ink/20 bg-muted/30 px-4 font-mono text-[10px] text-tertiary shrink-0">
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span>{data.language ? data.language.toUpperCase() : "PLAIN TEXT"}</span>
          <span>CodeMirror 6</span>
        </div>
        <div className="flex items-center gap-2">
          {data.focusRange && (
            <span className="text-destructive font-bold">
              Focus: L{data.focusRange.startLine} - L{data.focusRange.endLine}
            </span>
          )}
          <span>
            Lines: <strong>{startLine}</strong> - <strong>{endLine}</strong> ({lineCount} lines)
          </span>
        </div>
      </div>
    </div>
  );
}
