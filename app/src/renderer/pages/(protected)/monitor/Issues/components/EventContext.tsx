import { cn } from "@renderer/lib/utils";

import { buildEventContext, type EventTraceMeta } from "./event-data";

export function EventContext({
  payload,
  traceMeta,
}: {
  payload: Record<string, unknown>;
  traceMeta: EventTraceMeta;
}) {
  const groups = buildEventContext(payload, traceMeta);

  return (
    <div className="grid grid-cols-1 gap-3 p-3.5 @min-[760px]:grid-cols-2">
      {groups.map((group) => {
        const empty = group.rows.length === 0 && (group.tags?.length ?? 0) === 0;
        return (
          <section
            key={group.title}
            className="min-w-0 rounded-[10px] border border-hairline bg-overlay p-3"
          >
            <h3 className="m-0 mb-2.5 text-[9px] font-[700] tracking-[0.08em] text-tertiary uppercase">
              {group.title}
            </h3>
            {empty && <div className="font-mono text-[9px] text-tertiary">Not captured</div>}
            {group.tags && group.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {group.tags.map((tag) => (
                  <span
                    key={tag}
                    title={tag}
                    className="max-w-full truncate rounded-md border border-hairline bg-surface-1 px-1.5 py-1 font-mono text-[9px] text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {group.rows.map((row, index) => (
              <div
                key={`${row.key}-${index}`}
                className={cn(
                  "flex items-start justify-between gap-3 border-t border-hairline py-1.5 last:pb-0",
                  index === 0 && !group.tags?.length && "border-t-0 pt-0",
                )}
              >
                <span className="shrink-0 text-[9px] text-tertiary">{row.key}</span>
                <span
                  className="min-w-0 truncate text-right font-mono text-[9px] text-muted"
                  title={row.value}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
