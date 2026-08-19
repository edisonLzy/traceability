import { CodeBlock } from "@renderer/components/CodeBlock";

import type { NodeDetailViewProps } from ".";

export function CodeNodeDetail({ node }: NodeDetailViewProps) {
  const data = node.data;
  if (data.kind !== "code") return null;

  const range = data.startLine
    ? `${data.path}:${data.startLine}${data.endLine ? `-${data.endLine}` : ""}`
    : data.path;
  const language = data.language ?? data.path.split(".").pop();

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-tertiary">
        <span className="rounded-sm border border-hairline bg-surface-2 px-2 py-0.5 uppercase tracking-[0.08em] text-ink-muted">
          {data.language ?? "text"}
        </span>
        <span className="opacity-60">·</span>
        <span className="truncate text-ink" title={range}>
          {range}
        </span>
      </header>

      {data.snippet ? (
        <CodeBlock
          code={data.snippet}
          language={language}
          maxHeight="420px"
          showLineNumbers
          startLine={data.startLine ?? 1}
        />
      ) : (
        <div className="grid min-h-[180px] place-items-center rounded-sm border border-hairline bg-code-bg px-6 text-center font-mono text-[10px] leading-6 text-code-line-number">
          Source content was not captured for this node.
        </div>
      )}
    </div>
  );
}
