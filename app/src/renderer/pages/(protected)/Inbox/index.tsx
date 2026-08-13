import {
  useDismissInboxItem,
  useInboxItem,
  useInboxList,
  useInvalidateInbox,
  useReopenInboxItem,
  useResolveInboxItem,
} from "@renderer/hooks/use-inbox";
import { cn, relativeTime } from "@renderer/lib/utils";
import { projectStore } from "@renderer/store/project";
import {
  ArrowLeft,
  Bot,
  Check,
  CircleDot,
  CircleOff,
  Inbox,
  RotateCcw,
  Search,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

import {
  activityDescription,
  formatInboxDate,
  inboxStateLabel,
  shortIssueId,
  type InboxActivity,
  type InboxDetail,
  type InboxListItem,
  type InboxState,
} from "./view-model";

type InboxView = "active" | "done";

export function InboxPage() {
  const currentProject = useStore(projectStore, (state) => state.currentProject);
  const projectId = currentProject?.id ?? "";
  const [view, setView] = useState<InboxView>("active");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [selectedId, setSelectedId] = useState<string>();
  const [compactDetailOpen, setCompactDetailOpen] = useState(false);
  const activeQuery = useInboxList({ projectId, view: "active", query: deferredQuery, limit: 100 });
  const doneQuery = useInboxList({ projectId, view: "done", query: deferredQuery, limit: 100 });
  const visibleQuery = view === "active" ? activeQuery : doneQuery;
  const items = visibleQuery.data?.data ?? [];

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]!.id);
    }
  }, [items, selectedId]);

  const detailQuery = useInboxItem(selectedId);
  const selectedItem = detailQuery.data ?? null;

  return (
    <div className="@container h-full min-h-[520px] overflow-hidden p-2.5 @max-[660px]:p-2">
      <div className="grid h-full min-h-0 grid-cols-[286px_minmax(0,1fr)] gap-2.5 @max-[660px]:grid-cols-1">
        <InboxQueue
          activeCount={activeQuery.data?.data.length ?? 0}
          doneCount={doneQuery.data?.data.length ?? 0}
          items={items}
          loading={visibleQuery.isLoading}
          onQueryChange={setQuery}
          onSelect={(id) => {
            setSelectedId(id);
            setCompactDetailOpen(true);
          }}
          onViewChange={(nextView) => {
            setView(nextView);
            setCompactDetailOpen(false);
          }}
          query={query}
          selectedId={selectedId}
          view={view}
          compactDetailOpen={compactDetailOpen}
        />
        <section
          aria-label="Selected inbox item"
          className={cn(
            "glass-panel workspace-scroll-viewport min-w-0 overflow-auto rounded-[18px]",
            !compactDetailOpen && "@max-[660px]:hidden",
          )}
        >
          <InboxDetailPanel
            detail={selectedItem}
            loading={detailQuery.isLoading}
            onBack={() => setCompactDetailOpen(false)}
            projectName={currentProject?.name ?? "Current project"}
          />
        </section>
      </div>
    </div>
  );
}

interface InboxQueueProps {
  activeCount: number;
  doneCount: number;
  items: InboxListItem[];
  loading: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onViewChange: (view: InboxView) => void;
  query: string;
  selectedId?: string;
  view: InboxView;
  compactDetailOpen: boolean;
}

function InboxQueue({
  activeCount,
  doneCount,
  items,
  loading,
  onQueryChange,
  onSelect,
  onViewChange,
  query,
  selectedId,
  view,
  compactDetailOpen,
}: InboxQueueProps) {
  return (
    <aside
      aria-label="Inbox queue"
      className={cn(
        "glass-panel flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[18px]",
        compactDetailOpen && "@max-[660px]:hidden",
      )}
    >
      <div className="px-4 pt-4.5 pb-3.5">
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-[20px] font-[690] tracking-[-0.035em]">Inbox</h1>
          <span className="glass-control inline-grid h-5.5 min-w-5.5 place-items-center rounded-full px-1.5 text-[9px] font-[650] text-primary-hover tabular-nums">
            {activeCount}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-tertiary">Issues that need a decision.</p>
      </div>

      <label className="glass-control mx-3.5 mb-3 flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-tertiary transition-[border-color,box-shadow] focus-within:border-primary/55 focus-within:shadow-glow">
        <Search className="size-3.5 shrink-0" />
        <input
          aria-label="Search inbox"
          className="min-w-0 flex-1 border-0 bg-transparent text-[11px] text-ink outline-none placeholder:text-tertiary"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search inbox"
          type="search"
          value={query}
        />
      </label>

      <div
        aria-label="Inbox status"
        className="mx-3.5 mb-2.5 flex gap-1 rounded-[11px] bg-overlay p-1"
        role="tablist"
      >
        <QueueTab
          active={view === "active"}
          count={activeCount}
          label="Open"
          onClick={() => onViewChange("active")}
        />
        <QueueTab
          active={view === "done"}
          count={doneCount}
          label="Done"
          onClick={() => onViewChange("done")}
        />
      </div>

      <div className="workspace-scroll-viewport min-h-0 flex-1 overflow-auto px-2 pb-2.5">
        {items.map((item) => (
          <QueueItem
            active={item.id === selectedId}
            item={item}
            key={item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
        {items.length === 0 ? (
          <div className="grid min-h-44 place-items-center px-6 text-center text-[11px] leading-5 text-tertiary">
            {loading ? "Loading Inbox…" : "No Inbox items match this view."}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function QueueTab({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={cn(
        "inline-flex h-7.5 flex-1 items-center justify-center gap-1.5 rounded-[8px] border px-2 text-[9px] transition-[border-color,background-color,color,box-shadow]",
        active
          ? "glass-control border-primary/35 bg-primary/8 font-[630] text-ink shadow-glass-sm"
          : "border-transparent bg-transparent text-tertiary hover:bg-overlay hover:text-muted",
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label} <span className="text-tertiary tabular-nums">{count}</span>
    </button>
  );
}

function QueueItem({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: InboxListItem;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`Select ${item.issue.title}`}
      className={cn(
        "grid w-full grid-cols-[9px_minmax(0,1fr)] gap-2.5 rounded-[12px] border px-2.5 py-2.5 text-left transition-[border-color,background-color,box-shadow]",
        active
          ? "glass-control border-primary/35 bg-primary/8 shadow-glass-sm"
          : "border-transparent bg-transparent hover:bg-overlay",
      )}
      onClick={onClick}
      type="button"
    >
      <span
        aria-label={`${item.priority.toUpperCase()} priority`}
        className={cn(
          "mt-1.5 size-2 rounded-full",
          item.priority === "p1"
            ? "bg-danger shadow-[0_0_0_3px_rgba(207,63,63,0.12)]"
            : item.state === "open"
              ? "bg-warning shadow-[0_0_0_3px_rgba(169,123,28,0.12)]"
              : "bg-tertiary",
        )}
      />
      <span className="min-w-0">
        <span className="line-clamp-2 text-[12px] leading-[1.42] font-[590] text-ink">
          {item.issue.title}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[9px] text-tertiary">
          <span className="shrink-0">{shortIssueId(item.issueId)}</span>
          <span>·</span>
          <span className="truncate">{item.issue.type}</span>
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[10px] text-tertiary">
          <span className={cn("inline-flex items-center gap-1", stateTone(item.state))}>
            <span className="size-1 rounded-full bg-current" /> {inboxStateLabel(item.state)}
          </span>
          <span>{item.issue.eventCount.toLocaleString()} events</span>
          <span className="ml-auto shrink-0">{relativeTime(String(item.issue.lastSeen))}</span>
        </span>
      </span>
    </button>
  );
}

function InboxDetailPanel({
  detail,
  loading,
  projectName,
  onBack,
}: {
  detail: InboxDetail | null;
  loading: boolean;
  projectName: string;
  onBack: () => void;
}) {
  const resolve = useResolveInboxItem();
  const dismiss = useDismissInboxItem();
  const reopen = useReopenInboxItem();
  const invalidateInbox = useInvalidateInbox();
  const pending = resolve.isPending || dismiss.isPending || reopen.isPending;

  const changeState = async (action: "resolve" | "dismiss" | "reopen") => {
    if (!detail || pending) return;
    try {
      if (action === "resolve") await resolve.mutateAsync(detail.id);
      else if (action === "dismiss") await dismiss.mutateAsync(detail.id);
      else await reopen.mutateAsync(detail.id);
      await invalidateInbox();
      toast(
        action === "resolve"
          ? "Inbox item resolved"
          : action === "dismiss"
            ? "Inbox item dismissed"
            : "Inbox item reopened",
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (!detail) {
    return (
      <div className="grid min-h-full place-items-center px-8 text-center text-[11px] text-tertiary">
        {loading ? "Loading Inbox item…" : "Select an Inbox item to review it."}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 pt-4 pb-12">
      <header>
        <button
          aria-label="Back to Inbox queue"
          className="glass-control mb-3 hidden h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[10px] text-tertiary transition-colors hover:text-ink @max-[660px]:inline-flex"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="size-3.5" /> Inbox queue
        </button>
        <div className="flex items-center gap-2 text-[9px] font-[720] tracking-[0.08em] text-primary-hover uppercase">
          {detail.state === "open" ? "Needs attention" : "Triage completed"}
          <span className="rounded-full border border-danger/25 bg-danger/8 px-1.5 py-0.5 tracking-normal text-danger">
            {detail.priority.toUpperCase()}
          </span>
        </div>
        <h1 className="mt-1.5 line-clamp-3 text-[clamp(20px,2.1vw,24px)] leading-[1.16] font-[690] tracking-[-0.045em] text-ink">
          {detail.issue.title}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-tertiary">
          <span>{shortIssueId(detail.issueId)}</span>
          <span>{projectName}</span>
          <span>last seen {relativeTime(String(detail.issue.lastSeen))}</span>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          {detail.state === "open" ? (
            <>
              <ActionButton
                icon={Check}
                label="Resolve"
                onClick={() => void changeState("resolve")}
                pending={pending}
                primary
              />
              <ActionButton
                icon={CircleOff}
                label="Ignore"
                onClick={() => void changeState("dismiss")}
                pending={pending}
              />
            </>
          ) : (
            <ActionButton
              icon={RotateCcw}
              label="Reopen"
              onClick={() => void changeState("reopen")}
              pending={pending}
            />
          )}
        </div>
      </header>

      <div className="mt-3.5 flex flex-col gap-3.5">
        <DetailModule
          actions={<StateBadge state={detail.state} />}
          subtitle="The trigger that requires a decision"
          title="Why this is in Inbox"
        >
          <div className="grid grid-cols-[30px_minmax(0,1fr)] gap-3 p-3.5">
            <span className="glass-control grid size-7.5 place-items-center rounded-[10px] border-warning/25 bg-warning/8 text-warning">
              <Zap className="size-3.5" />
            </span>
            <div>
              <strong className="block text-[10px] font-[650] text-ink">
                {detail.triggerReason}
              </strong>
              <p className="mt-1 text-[10px] leading-[1.55] text-subtle">
                Traceability groups repeated events into one actionable work item so the team can
                make one decision.
              </p>
            </div>
          </div>
        </DetailModule>

        <DetailModule
          subtitle="Structured investigation context attached to this work item"
          title="Investigation brief"
        >
          <InvestigationBrief detail={detail} />
        </DetailModule>

        <DetailModule subtitle="Latest grouped monitoring evidence" title="Issue overview">
          <div className="grid grid-cols-2 @min-[620px]:grid-cols-4">
            <Fact
              label="Events"
              value={`${detail.issue.eventCount.toLocaleString()} occurrences`}
            />
            <Fact label="First seen" value={formatInboxDate(detail.issue.firstSeen)} />
            <Fact label="Last seen" value={relativeTime(String(detail.issue.lastSeen))} />
            <Fact label="Type" value={detail.issue.type} />
          </div>
        </DetailModule>

        <DetailModule subtitle="Work item history" title="Activity">
          <div className="px-3.5">
            {detail.activities.map((activity) => (
              <ActivityRow activity={activity} key={activity.id} />
            ))}
            {detail.activities.length === 0 ? (
              <div className="py-5 text-center text-[10px] text-tertiary">No activity yet.</div>
            ) : null}
          </div>
        </DetailModule>
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  pending,
  primary = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  pending: boolean;
  primary?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-8.5 items-center gap-1.5 rounded-[10px] border px-3 text-[10px] font-[600] transition-[border-color,background-color,color,box-shadow] disabled:cursor-wait disabled:opacity-50",
        primary
          ? "border-primary/45 bg-primary text-primary-foreground shadow-glow hover:bg-primary-hover"
          : "glass-control text-muted hover:border-hairline-strong hover:bg-overlay-strong hover:text-ink",
      )}
      disabled={pending}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

function InvestigationBrief({ detail }: { detail: InboxDetail }) {
  const hasBrief = Boolean(detail.summary || detail.hypothesis || detail.nextAction);
  if (!hasBrief) {
    return (
      <div className="px-4 py-6 text-center">
        <span className="glass-control mx-auto mb-2 grid size-9 place-items-center rounded-[11px] border-primary/20 bg-primary/10 text-primary-hover shadow-glow">
          <Sparkles className="size-4" />
        </span>
        <strong className="block text-[11px] font-[650] text-ink">
          No investigation brief yet
        </strong>
        <p className="mx-auto mt-1 max-w-[360px] text-[10px] leading-5 text-tertiary">
          Structured findings can be attached to this work item when they become available.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 @min-[620px]:grid-cols-3">
      <BriefCell label="Summary" value={detail.summary} />
      <BriefCell label="Hypothesis" value={detail.hypothesis} />
      <BriefCell label="Next action" value={detail.nextAction} />
    </div>
  );
}

function BriefCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 border-t border-hairline p-3.5 first:border-t-0 @min-[620px]:border-t-0 @min-[620px]:border-l @min-[620px]:first:border-l-0">
      <DataLabel>{label}</DataLabel>
      <p className="mt-1.5 text-[10px] leading-[1.55] text-muted">{value || "Not provided"}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-l border-hairline p-3.5 first:border-l-0 nth-[-n+2]:border-t-0 @min-[620px]:border-t-0 @min-[620px]:first:border-l-0">
      <DataLabel>{label}</DataLabel>
      <div className="mt-1.5 truncate text-[10px] font-[600] text-muted" title={value}>
        {value}
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: InboxActivity }) {
  const Icon = activityIcon(activity);
  return (
    <div className="grid min-h-10 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 border-b border-hairline text-[10px] text-muted last:border-b-0">
      <span className="grid size-4.5 place-items-center rounded-[6px] bg-overlay text-tertiary">
        <Icon className="size-2.5" />
      </span>
      <span>{activityDescription(activity)}</span>
      <span className="shrink-0 text-tertiary">{relativeTime(String(activity.createdAt))}</span>
    </div>
  );
}

function activityIcon(activity: InboxActivity): LucideIcon {
  if (activity.type === "brief_updated") return Bot;
  if (activity.type === "created") return Inbox;
  const toState = activity.payload.toState;
  if (toState === "done") return Check;
  if (toState === "dismissed") return CircleOff;
  return CircleDot;
}

function DetailModule({
  actions,
  children,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="glass-panel overflow-hidden rounded-[16px]">
      <header className="flex min-h-11.5 items-center gap-2 border-b border-hairline px-3.5 py-2.5">
        <h2 className="shrink-0 text-[12px] font-[660] text-muted">{title}</h2>
        <span className="truncate text-[10px] text-tertiary">{subtitle}</span>
        {actions ? <span className="ml-auto">{actions}</span> : null}
      </header>
      {children}
    </section>
  );
}

function StateBadge({ state }: { state: InboxState }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-1.5 rounded-full border border-hairline bg-overlay px-2 text-[9px] font-[630]",
        stateTone(state),
      )}
    >
      <span className="size-1 rounded-full bg-current" /> {inboxStateLabel(state)}
    </span>
  );
}

function DataLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[9px] font-[700] tracking-[0.08em] text-tertiary uppercase">
      {children}
    </div>
  );
}

function stateTone(state: InboxState): string {
  if (state === "done") return "text-success";
  if (state === "dismissed") return "text-tertiary";
  return "text-danger";
}
