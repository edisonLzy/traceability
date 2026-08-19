import type { NodeDetailViewProps } from ".";

export function QuestionNodeDetail({ node }: NodeDetailViewProps) {
  const data = node.data;
  if (data.kind !== "question") return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-6 text-ink">{data.prompt}</p>
      {data.intent ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">
            Intent
          </h3>
          <p className="rounded-sm border border-hairline bg-surface-2 px-3 py-2 text-[12px] leading-5 text-ink-muted">
            {data.intent}
          </p>
        </section>
      ) : null}
    </div>
  );
}
