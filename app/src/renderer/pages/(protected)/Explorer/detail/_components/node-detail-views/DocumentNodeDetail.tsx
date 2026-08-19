import type { NodeDetailViewProps } from ".";

export function DocumentNodeDetail({ node }: NodeDetailViewProps) {
  const data = node.data;
  if (data.kind !== "document") return null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">Title</h3>
        <p className="text-[15px] leading-6 text-ink">{data.title}</p>
      </section>

      {data.path ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">Path</h3>
          <code className="rounded-sm border border-hairline bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink">
            {data.path}
          </code>
        </section>
      ) : null}

      {data.excerpt ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">
            Excerpt
          </h3>
          <p className="rounded-sm border border-hairline bg-surface-2 px-3 py-2 text-[12px] leading-5 text-ink-muted">
            {data.excerpt}
          </p>
        </section>
      ) : null}
    </div>
  );
}
