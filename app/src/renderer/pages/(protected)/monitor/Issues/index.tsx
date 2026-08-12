import { HoverCard, HoverCardContent, HoverCardTrigger } from "@renderer/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { useIssues } from "@renderer/hooks/use-issues";
import { cn, relativeTime, statusGroup } from "@renderer/lib/utils";
import { projectStore } from "@renderer/store/project";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useStore } from "zustand";

type StatusFilter = "all" | "unresolved" | "resolved" | "ignored";

const STATUS_ITEMS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "unresolved", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
];

export function IssuesPage() {
  const projectId = useStore(projectStore, (state) => state.currentProject?.id ?? "");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const { data, isLoading } = useIssues({ projectId, limit: 100 });
  const issues = data?.data ?? [];
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return issues.filter((issue) => {
      if (status !== "all" && statusGroup(issue.status) !== status) return false;
      if (
        normalizedQuery &&
        !`${issue.title} ${issue.id} ${issue.fingerprint}`.toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [issues, query, status]);

  const open = issues.filter((issue) => statusGroup(issue.status) === "unresolved").length;
  const resolved = issues.filter((issue) => statusGroup(issue.status) === "resolved").length;
  const ignored = issues.filter((issue) => statusGroup(issue.status) === "ignored").length;
  const events = issues.reduce((total, issue) => total + issue.eventCount, 0);
  const selectedStatusLabel =
    STATUS_ITEMS.find((item) => item.value === status)?.label ?? "All statuses";

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["issues"] });
    toast("Monitoring data refreshed");
  };

  return (
    <div className="@container mx-auto block min-h-full max-w-[1120px] px-[22px] pt-[22px] pb-12 @max-[620px]:px-4">
      <header className="mb-[18px] flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1 basis-[360px]">
          <div className="mb-1 text-[11px] font-[680] tracking-[0.07em] text-primary-hover uppercase">
            Monitor
          </div>
          <h1 className="m-0 text-[24px] leading-[1.12] font-[680] tracking-[-0.04em]">Issues</h1>
          <p className="mt-1.5 max-w-[620px] text-[12px] text-tertiary">
            Triage grouped runtime problems. Long titles stay on one line so every issue remains
            scannable.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="glass-control inline-flex h-8.5 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-[590] text-muted transition-colors duration-150 [transition-timing-function:var(--ease-out)] hover:bg-overlay-strong hover:text-ink active:bg-overlay-strong"
        >
          <RefreshCw className="size-3.5" /> Refresh
        </button>
      </header>

      <div className="glass-panel mb-[18px] grid grid-cols-2 overflow-hidden rounded-[18px] @min-[850px]:grid-cols-4">
        <Metric
          index={0}
          label="Open issues"
          value={open}
          note="Needs triage"
          noteClass="text-warning"
        />
        <Metric
          index={1}
          label="Total events"
          value={events.toLocaleString()}
          note="Across loaded issues"
        />
        <Metric index={2} label="Ignored" value={ignored} note="Excluded from active triage" />
        <Metric
          index={3}
          label="Resolved"
          value={resolved}
          note="Successfully closed issues"
          noteClass="text-success"
        />
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <label className="glass-control flex h-9 min-w-[220px] flex-1 basis-[300px] items-center gap-2 rounded-[10px] px-2.5 text-tertiary focus-within:border-primary/55 focus-within:shadow-[0_0_0_3px_var(--glow)]">
          <Search className="size-3.5 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search issues"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-tertiary"
          />
        </label>

        <Select
          value={status}
          onValueChange={(nextStatus) => {
            if (isStatusFilter(nextStatus)) setStatus(nextStatus);
          }}
        >
          <SelectTrigger
            aria-label="Filter issue status"
            className="glass-control w-[132px] rounded-[10px] text-[12px] hover:border-hairline-strong data-popup-open:border-primary/55"
          >
            <SelectValue>{selectedStatusLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent className="glass-panel-raised w-[var(--anchor-width)] rounded-[12px] p-1">
            {STATUS_ITEMS.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                className="rounded-[7px] py-2 text-[11px]"
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-[11px] text-tertiary @max-[520px]:w-full @max-[520px]:text-right">
          {filtered.length} of {issues.length} issues
        </span>
      </div>

      <section className="glass-panel overflow-hidden rounded-[18px]">
        <div className="flex min-h-12 items-center border-b border-hairline px-4">
          <span className="text-[12px] font-[630] text-muted">All issues</span>
          <span className="ml-auto text-[11px] text-tertiary">Updated in real time</span>
        </div>
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr>
              <TableHeading className="w-auto">Issue</TableHeading>
              <TableHeading className="w-[112px] @max-[620px]:hidden">Status</TableHeading>
              <TableHeading className="w-[78px]">Events</TableHeading>
              <TableHeading className="w-[112px] @max-[500px]:w-[88px]">Last seen</TableHeading>
            </tr>
          </thead>
          <tbody>
            {filtered.map((issue) => {
              const group = statusGroup(issue.status);
              const href = `/monitor/issues/${issue.id}`;
              return (
                <tr
                  key={issue.id}
                  onClick={() => navigate(href)}
                  className="h-[58px] cursor-pointer transition-colors hover:bg-overlay-strong active:bg-overlay"
                >
                  <td className="h-[58px] min-w-0 border-b border-hairline px-4 py-0 text-[12px] text-muted">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          issue.type === "error"
                            ? "bg-danger shadow-[0_0_0_3px_rgba(241,124,124,0.1)]"
                            : "bg-warning shadow-[0_0_0_3px_rgba(228,181,90,0.1)]",
                        )}
                      />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <HoverCard>
                          <HoverCardTrigger
                            render={
                              <button
                                type="button"
                                aria-label={`Open issue: ${issue.title}`}
                                title={issue.title}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(href);
                                }}
                                className="block w-full truncate text-left text-[12px] font-[590] text-ink outline-none focus-visible:underline"
                              />
                            }
                          >
                            {issue.title}
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="top"
                            align="start"
                            className="w-80 max-w-[min(320px,var(--available-width))] rounded-[9px] border border-hairline-strong bg-surface-glass-elevated p-2.5 text-[11px] leading-5 text-ink shadow-[0_14px_36px_rgba(0,0,0,0.2)]"
                          >
                            {issue.title}
                          </HoverCardContent>
                        </HoverCard>
                        <div
                          className="mt-0.5 truncate font-mono text-[10px] text-tertiary"
                          title={`${issue.id} · ${issue.fingerprint}`}
                        >
                          {issue.id} · {shortFingerprint(issue.fingerprint)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="h-[58px] border-b border-hairline px-4 py-0 @max-[620px]:hidden">
                    <StatusBadge group={group} />
                  </td>
                  <td className="h-[58px] border-b border-hairline px-4 py-0 text-[12px] text-muted tabular-nums">
                    {issue.eventCount.toLocaleString()}
                  </td>
                  <td className="h-[58px] border-b border-hairline px-4 py-0 text-[12px] whitespace-nowrap text-muted">
                    {relativeTime(String(issue.lastSeen))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-[12px] text-tertiary">
            {isLoading ? "Loading issues…" : "No issues match the selected filters."}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  index,
  label,
  value,
  note,
  noteClass,
}: {
  index: number;
  label: string;
  value: number | string;
  note: string;
  noteClass?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-[84px] border-hairline px-4 py-3.5 @min-[850px]:border-b-0",
        index < 2 && "border-b",
        index % 2 === 0 && "border-r",
        index < 3 && "@min-[850px]:border-r",
        index === 3 && "@min-[850px]:border-r-0",
      )}
    >
      <div className="text-[11px] font-[570] text-tertiary">{label}</div>
      <div className="mt-1 text-[22px] font-[660] tracking-[-0.045em] tabular-nums">{value}</div>
      <div className={cn("mt-0.5 text-[10px] text-tertiary", noteClass)}>{note}</div>
    </div>
  );
}

function TableHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "h-9 border-b border-hairline px-4 py-0 text-[10px] font-[670] tracking-[0.075em] text-tertiary uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function StatusBadge({ group }: { group: "unresolved" | "resolved" | "ignored" }) {
  const dot =
    group === "unresolved" ? "bg-danger" : group === "resolved" ? "bg-success" : "bg-muted";
  const label = group === "unresolved" ? "Open" : group === "resolved" ? "Resolved" : "Ignored";
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-hairline bg-overlay px-2 text-[10px] font-[600] whitespace-nowrap text-muted">
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return value === "all" || value === "unresolved" || value === "resolved" || value === "ignored";
}

function shortFingerprint(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}
