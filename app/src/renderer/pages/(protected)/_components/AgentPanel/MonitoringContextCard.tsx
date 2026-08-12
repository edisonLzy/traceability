import { cn } from "@renderer/lib/utils";
import type { MonitoringContext } from "@renderer/store/agent";
import { Link } from "lucide-react";

export function MonitoringContextCard({
  className,
  context,
}: {
  className?: string;
  context: MonitoringContext;
}) {
  const objectLabel = context.issueTitle ?? "Selected Inbox issue";
  const projectLabel = context.projectName ?? context.projectId;
  const issueLabel = context.issueId?.slice(0, 8).toUpperCase();

  return (
    <div
      className={cn(
        "glass-control grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 rounded-[12px] p-3",
        className,
      )}
    >
      <span className="grid size-7 place-items-center rounded-[9px] border border-primary/20 bg-primary/10 text-primary-hover shadow-glass-sm">
        <Link className="size-3.5" />
      </span>
      <div className="min-w-0">
        <strong className="block truncate text-[11px] font-[620] text-ink">{objectLabel}</strong>
        <span className="mt-0.5 block truncate text-[9px] text-tertiary">
          {projectLabel}
          {issueLabel ? ` · ${issueLabel}` : ""}
        </span>
      </div>
    </div>
  );
}
