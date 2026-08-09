import { Braces, MousePointerClick, Navigation, Network, TerminalSquare } from "lucide-react";

import { readBreadcrumbs, type BreadcrumbData } from "./event-data";

export function EventBreadcrumbs({ payload }: { payload: Record<string, unknown> }) {
  const breadcrumbs = readBreadcrumbs(payload).reverse();
  if (breadcrumbs.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-[11px] text-tertiary">
        No breadcrumbs were captured for this event.
      </div>
    );
  }

  return (
    <div className="px-3.5 py-0.5">
      {breadcrumbs.map((breadcrumb) => {
        const Icon = breadcrumbIcon(breadcrumb);
        const detail = breadcrumb.data ?? breadcrumb.level;
        return (
          <div
            key={breadcrumb.id}
            className="grid grid-cols-[18px_minmax(0,1fr)_auto] gap-2.5 border-b border-hairline py-2.5 last:border-b-0"
          >
            <span className="grid size-[18px] place-items-center rounded-md bg-overlay text-tertiary">
              <Icon className="size-3" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[10px] font-[620] text-muted">
                {breadcrumb.category}
                {breadcrumb.message
                  ? ` · ${breadcrumb.message}`
                  : breadcrumb.type
                    ? ` · ${breadcrumb.type}`
                    : ""}
              </div>
              {detail && (
                <div className="mt-0.5 truncate font-mono text-[9px] text-tertiary" title={detail}>
                  {detail}
                </div>
              )}
            </div>
            <time
              className="font-mono text-[9px] text-tertiary"
              dateTime={timestampDateTime(breadcrumb.timestamp)}
            >
              {formatTimestamp(breadcrumb.timestamp)}
            </time>
          </div>
        );
      })}
    </div>
  );
}

function breadcrumbIcon(breadcrumb: BreadcrumbData) {
  const haystack = `${breadcrumb.category} ${breadcrumb.type ?? ""}`.toLowerCase();
  if (haystack.includes("click") || haystack.includes("ui")) return MousePointerClick;
  if (haystack.includes("navigation")) return Navigation;
  if (haystack.includes("http") || haystack.includes("fetch") || haystack.includes("xhr")) {
    return Network;
  }
  if (haystack.includes("console")) return TerminalSquare;
  return Braces;
}

function formatTimestamp(timestamp: string | number | null): string {
  const date = toDate(timestamp);
  return date
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";
}

function timestampDateTime(timestamp: string | number | null): string | undefined {
  return toDate(timestamp)?.toISOString();
}

function toDate(timestamp: string | number | null): Date | null {
  if (timestamp === null) return null;
  const date = new Date(
    typeof timestamp === "number" && timestamp < 1e12 ? timestamp * 1000 : timestamp,
  );
  return Number.isNaN(date.valueOf()) ? null : date;
}
