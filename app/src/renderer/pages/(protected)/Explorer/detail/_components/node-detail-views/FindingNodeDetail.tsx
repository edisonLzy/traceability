import type { NodeDetailViewProps } from ".";

function statusTone(status: string) {
  if (status === "confirmed") return "border-success/35 bg-success/10 text-success";
  if (status === "rejected") return "border-danger/35 bg-danger/10 text-danger";
  return "border-hairline bg-surface-2 text-ink-muted";
}

export function FindingNodeDetail({ node }: NodeDetailViewProps) {
  const data = node.data;
  if (data.kind !== "finding") return null;

  const confidencePercent =
    data.confidence !== undefined ? Math.round(data.confidence * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-6 text-ink">{data.summary}</p>

      {confidencePercent !== null ? (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">
              Confidence
            </h3>
            <span className="font-mono text-[11px] text-ink">{confidencePercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm border border-hairline bg-surface-2">
            <div
              className="h-full bg-success"
              style={{ width: `${Math.max(0, Math.min(100, confidencePercent))}%` }}
            />
          </div>
        </section>
      ) : null}

      {data.status ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">
            Status
          </h3>
          <span
            className={`inline-flex w-fit items-center rounded-sm border px-2 py-1 text-[10px] font-[700] uppercase tracking-[0.08em] ${statusTone(data.status)}`}
          >
            {data.status}
          </span>
        </section>
      ) : null}
    </div>
  );
}
