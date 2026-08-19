import type { Extension } from "@codemirror/state";

/**
 * 精简版语言映射，只支持 explorer/code 节点常见的几种语法。语言包按需
 * dynamic import，避免把不用的解析器打入主 bundle。未知后缀或缺少
 * 语言参数时返回 null，调用方应使用纯文本 fallback。
 */
type LanguageLoader = () => Promise<Extension | Extension[]>;

const MAP: Record<string, LanguageLoader> = {
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  py: () => import("@codemirror/lang-python").then((m) => m.python()),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  tsx: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ jsx: true, typescript: true }),
    ),
};

const LANGUAGE_ALIASES: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  markdown: "md",
  html: "js",
  htm: "js",
};

function resolveKey(language: string | undefined): string | undefined {
  if (!language) return undefined;
  const normalized = language.toLowerCase().replace(/^.*\./, (match) => match);
  const bare = normalized.startsWith(".") ? normalized.slice(1) : normalized;
  if (bare in MAP) return bare;
  if (language.toLowerCase() in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[language.toLowerCase()];
  }
  return bare in MAP ? bare : undefined;
}

export function loadLanguageExtension(language: string | undefined): Promise<Extension[]> | null {
  const key = resolveKey(language);
  if (!key) return null;
  const loader = MAP[key];
  if (!loader) return null;
  return loader().then((ext) => (Array.isArray(ext) ? ext : [ext]));
}
