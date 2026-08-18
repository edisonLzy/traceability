import { useRegisterCommands } from "@renderer/commands";
import {
  useIssue,
  useIssueEvents,
  useIssueMinidumps,
  useRelatedReplays,
  useUpdateIssue,
} from "@renderer/hooks/use-issue";
import type { AppRouterOutputs, Event } from "@renderer/lib/trpc-types";
import { cn, relativeTime, statusGroup } from "@renderer/lib/utils";
import { projectStore } from "@renderer/store/project";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDot,
  CircleOff,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useStore } from "zustand";

import { readBreadcrumbs, readExceptionValues, shortId } from "./components/event-data";
import { EventBreadcrumbs } from "./components/EventBreadcrumbs";
import { EventContext } from "./components/EventContext";
import { MinidumpAttachments } from "./components/MinidumpAttachments";
import { Stacktrace, SymbolicationBadge } from "./components/Stacktrace";

type IssueStatus = "unresolved" | "resolved" | "ignored";
type ReplaySummary = AppRouterOutputs["replays"]["list"]["data"][number];

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentProject = useStore(projectStore, (state) => state.currentProject);
  const issueQuery = useIssue(id);
  const eventsQuery = useIssueEvents(id);
  const updateIssue = useUpdateIssue();
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const issue = issueQuery.data ?? null;
  const minidumpsQuery = useIssueMinidumps(id, Boolean(issue));
  const minidumps = minidumpsQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];
  const relatedReplaysQuery = useRelatedReplays(issue?.projectId, selectedEvent?.eventId);

  useRegisterCommands(() => {
    if (!issue) return [];
    return [
      {
        id: "issue.back",
        group: { id: "issue", label: "Current issue", order: 50 },
        title: "Back to Issues",
        description: "Return to the issue list",
        icon: ArrowLeft,
        action: () => navigate(-1),
      },
    ];
  }, [issue, navigate]);

  const changeStatus = async (status: IssueStatus) => {
    if (!issue) return;
    try {
      await updateIssue.mutateAsync({ issueId: issue.id, patch: { status } });
      await Promise.all([
        issueQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
      ]);
      toast("Issue status updated");
    } catch (cause) {
      toast(String(cause));
    }
  };

  if (!issue) {
    return (
      <div className="mx-auto block min-h-full max-w-[1120px] px-5 pt-5 pb-12">
        <div className="px-5 py-12 text-center text-[12px] text-tertiary">
          {issueQuery.isLoading ? "Loading…" : "Issue not found."}
        </div>
      </div>
    );
  }

  const group = statusGroup(issue.status);
  const projectName = currentProject?.name ?? issue.projectId;
  const exceptions = selectedEvent ? readExceptionValues(selectedEvent.payload) : [];
  const breadcrumbCount = selectedEvent ? readBreadcrumbs(selectedEvent.payload).length : 0;
  const relatedReplays = relatedReplaysQuery.data?.data ?? [];

  return (
    <div className="@container mx-auto block min-h-full max-w-[1120px] px-5 pt-5 pb-14 @max-[620px]:px-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 -ml-2 inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-tertiary transition-colors hover:bg-overlay hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Issues
      </button>

      <header className="mb-[18px] flex flex-wrap items-start gap-3.5">
        <span
          className={cn(
            "mt-2 size-2.5 shrink-0 rounded-full",
            issue.type === "error"
              ? "bg-danger shadow-[0_0_0_4px_rgba(207,63,63,0.09)]"
              : "bg-warning",
          )}
        />
        <div className="min-w-0 flex-1 basis-[360px]">
          <div className="mb-1 text-[10px] font-[700] tracking-[0.08em] text-primary-hover uppercase">
            {issue.type === "error" ? "Unhandled exception" : "Runtime issue"}
          </div>
          <h1
            title={issue.title}
            className="m-0 line-clamp-2 text-[22px] leading-[1.18] font-[680] tracking-[-0.04em]"
          >
            {issue.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-tertiary">
            <span>{issue.id}</span>
            <span>{projectName}</span>
            <span>last seen {relativeTime(String(issue.lastSeen))}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 @max-[620px]:ml-[23px] @max-[620px]:w-full">
          <button
            type="button"
            disabled={updateIssue.isPending}
            onClick={() => void changeStatus(group === "unresolved" ? "resolved" : "unresolved")}
            className="glass-control inline-flex h-8.5 items-center gap-1.5 rounded-[10px] px-3 text-[11px] font-[590] text-muted transition-colors duration-150 [transition-timing-function:var(--ease-out)] hover:bg-overlay-strong active:bg-overlay-strong disabled:opacity-50"
          >
            {group === "unresolved" ? (
              <Check className="size-3.5" />
            ) : (
              <CircleDot className="size-3.5" />
            )}
            {group === "unresolved" ? "Resolve" : "Reopen"}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3.5">
        <IssueModule
          id="issue-overview"
          title="Issue overview"
          subtitle="Grouped by fingerprint and resolved source frames"
          actions={<StatusBadge group={group} />}
        >
          <div className="grid grid-cols-2">
            <OverviewCell
              label="Events"
              value={`${issue.eventCount.toLocaleString()} occurrences`}
              className="border-r border-b"
            />
            <OverviewCell
              label="First seen"
              value={formatDateTime(issue.firstSeen)}
              className="border-b"
            />
            <OverviewCell
              label="Last seen"
              value={relativeTime(String(issue.lastSeen))}
              className="border-r"
            />
            <OverviewCell
              label="Fingerprint"
              value={shortId(issue.fingerprint)}
              title={issue.fingerprint}
              mono
            />
          </div>
          <div
            className="flex flex-wrap gap-1.5 border-t border-hairline px-3.5 py-3"
            aria-label="Issue status"
          >
            <StatusButton
              active={group === "unresolved"}
              label="Open"
              icon={CircleDot}
              disabled={updateIssue.isPending}
              onClick={() => void changeStatus("unresolved")}
            />
            <StatusButton
              active={group === "resolved"}
              label="Resolved"
              icon={Check}
              disabled={updateIssue.isPending}
              onClick={() => void changeStatus("resolved")}
            />
            <StatusButton
              active={group === "ignored"}
              label="Ignored"
              icon={CircleOff}
              disabled={updateIssue.isPending}
              onClick={() => void changeStatus("ignored")}
            />
          </div>
        </IssueModule>

        {(issue.type === "native_crash" || minidumps.length > 0) && (
          <MinidumpAttachments
            minidumps={minidumps}
            loading={minidumpsQuery.isLoading}
            failed={minidumpsQuery.isError}
            onRetry={() => void minidumpsQuery.refetch()}
          />
        )}

        <IssueModule
          id="occurrences"
          title="Occurrences"
          subtitle="Select an event to refresh every evidence module below"
          actions={<NeutralBadge>Latest first</NeutralBadge>}
        >
          {events.length > 0 ? (
            <>
              <div
                className="flex gap-1.5 overflow-x-auto border-b border-hairline px-3 py-2.5"
                role="tablist"
                aria-label="Event occurrences"
              >
                {events.map((event, index) => {
                  const active = event.id === selectedEvent?.id;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedEventId(event.id)}
                      className={cn(
                        "glass-control inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[9px] text-tertiary transition-colors",
                        active && "border-primary/45 bg-primary/8 text-primary-hover",
                      )}
                    >
                      <strong className="font-mono font-[600] text-muted">
                        #{Math.max(issue.eventCount - index, 1)}
                      </strong>
                      {relativeTime(String(event.eventTimestamp))}
                    </button>
                  );
                })}
              </div>
              {selectedEvent && <EventSummary event={selectedEvent} />}
            </>
          ) : (
            <EmptyState>
              {eventsQuery.isLoading
                ? "Loading occurrences…"
                : "No events were captured for this issue."}
            </EmptyState>
          )}
        </IssueModule>

        <IssueModule id="exception" title="Exception" subtitle="Original Sentry exception values">
          {exceptions.length > 0 ? (
            <div className="divide-y divide-hairline">
              {exceptions.map((exception, index) => (
                <div key={`${exception.type}-${index}`} className="flex items-start gap-3 p-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-danger/20 bg-danger/8 text-danger">
                    <TriangleAlert className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="mb-1 break-words font-mono text-[11px] font-[630] text-ink">
                      {exception.type}
                    </div>
                    <div className="break-words text-[11px] leading-6 text-muted">
                      {exception.value}
                    </div>
                    {exception.mechanism && (
                      <div className="mt-1 font-mono text-[9px] text-tertiary">
                        {exception.mechanism}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No exception value was captured for this event.</EmptyState>
          )}
        </IssueModule>

        <IssueModule
          id="stack-trace"
          title="Stack trace"
          subtitle="Resolved source shown in a read-only CodeMirror surface"
          actions={selectedEvent ? <SymbolicationBadge payload={selectedEvent.payload} /> : null}
        >
          {selectedEvent ? (
            <Stacktrace key={selectedEvent.id} payload={selectedEvent.payload} />
          ) : (
            <EmptyState>Select an occurrence to inspect its stack.</EmptyState>
          )}
        </IssueModule>

        <IssueModule
          id="breadcrumbs"
          title="Breadcrumbs"
          subtitle="User and application actions captured before the exception"
          actions={<NeutralBadge>{breadcrumbCount} captured</NeutralBadge>}
        >
          {selectedEvent ? (
            <EventBreadcrumbs payload={selectedEvent.payload} />
          ) : (
            <EmptyState>Select an occurrence to inspect its breadcrumbs.</EmptyState>
          )}
        </IssueModule>

        <IssueModule
          id="event-context"
          title="Event context"
          subtitle="Request, runtime, trace, tags and additional data"
        >
          {selectedEvent ? (
            <EventContext
              payload={selectedEvent.payload}
              traceMeta={{ traceId: selectedEvent.traceId, spanId: selectedEvent.spanId }}
            />
          ) : (
            <EmptyState>Select an occurrence to inspect its context.</EmptyState>
          )}
        </IssueModule>

        <IssueModule
          id="related-replay"
          title="Related session replay"
          subtitle="Matched through the selected event ID"
          actions={relatedReplays.length > 0 ? <SuccessBadge>Replay available</SuccessBadge> : null}
        >
          <RelatedReplayBody
            eventId={selectedEvent?.eventId}
            isLoading={relatedReplaysQuery.isLoading}
            hasError={relatedReplaysQuery.isError}
            replays={relatedReplays}
          />
        </IssueModule>

        <RawPayloadModule payload={selectedEvent?.payload} />
      </div>
    </div>
  );
}

function IssueModule({
  id,
  title,
  subtitle,
  actions,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="glass-panel overflow-hidden rounded-[16px]">
      <div className="flex min-h-11.5 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-hairline px-3.5 py-2.5">
        <h2 id={titleId} className="m-0 text-[12px] font-[660] text-muted">
          {title}
        </h2>
        {subtitle && (
          <span className="min-w-0 flex-1 truncate text-[10px] text-tertiary">{subtitle}</span>
        )}
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function OverviewCell({
  label,
  value,
  title,
  mono,
  className,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 border-hairline px-3.5 py-2.5", className)}>
      <div className="mb-1 text-[9px] font-[700] tracking-[0.07em] text-tertiary uppercase">
        {label}
      </div>
      <div
        title={title ?? value}
        className={cn(
          "truncate text-[11px] font-[580] text-muted",
          mono && "font-mono text-[10px]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EventSummary({ event }: { event: Event }) {
  const items = [
    { label: "Event ID", value: shortId(event.eventId), title: event.eventId, mono: true },
    { label: "Level", value: event.level ?? "Not captured" },
    { label: "Release", value: event.release ?? "Not captured", mono: true },
    { label: "Environment", value: event.environment ?? "Not captured" },
    { label: "Occurred", value: formatDateTime(event.eventTimestamp) },
    { label: "Received", value: formatDateTime(event.receivedAt) },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-3 px-3.5 py-3 @min-[760px]:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <div className="mb-1 text-[9px] font-[700] tracking-[0.07em] text-tertiary uppercase">
            {item.label}
          </div>
          <div
            title={item.title ?? item.value}
            className={cn("truncate text-[10px] text-muted", item.mono && "font-mono")}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusButton({
  active,
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "glass-control inline-flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 text-[10px] text-muted transition-colors hover:bg-overlay-strong active:bg-overlay-strong disabled:opacity-50",
        active && "border-primary/50 bg-primary/10 text-ink",
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

function StatusBadge({ group }: { group: IssueStatus }) {
  const dot =
    group === "unresolved" ? "bg-danger" : group === "resolved" ? "bg-success" : "bg-muted";
  const label = group === "unresolved" ? "Open" : group === "resolved" ? "Resolved" : "Ignored";
  return <PillBadge dot={dot}>{label}</PillBadge>;
}

function SuccessBadge({ children }: { children: ReactNode }) {
  return <PillBadge dot="bg-success">{children}</PillBadge>;
}

function PillBadge({ children, dot }: { children: ReactNode; dot?: string }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-hairline bg-overlay px-2 text-[9px] font-[650] whitespace-nowrap text-muted">
      {dot && <span className={cn("size-1.5 rounded-full", dot)} />}
      {children}
    </span>
  );
}

function NeutralBadge({ children }: { children: ReactNode }) {
  return <PillBadge>{children}</PillBadge>;
}

function RelatedReplayBody({
  eventId,
  isLoading,
  hasError,
  replays,
}: {
  eventId: string | undefined;
  isLoading: boolean;
  hasError: boolean;
  replays: ReplaySummary[];
}) {
  if (!eventId) return <EmptyState>Select an occurrence to check for a related replay.</EmptyState>;
  if (isLoading) return <EmptyState>Checking replay association…</EmptyState>;
  if (hasError)
    return <EmptyState>The replay API could not verify this event association.</EmptyState>;
  if (replays.length === 0) {
    return <EmptyState>No replay reports the selected event ID ({shortId(eventId)}).</EmptyState>;
  }

  const replay = replays[0]!;
  return (
    <div className="grid grid-cols-1 gap-3 p-3.5 @min-[760px]:grid-cols-[minmax(0,1fr)_auto]">
      <div className="glass-control min-w-0 rounded-[12px] p-3">
        <div className="mb-1 text-[9px] font-[700] tracking-[0.07em] text-tertiary uppercase">
          Replay ID
        </div>
        <div title={replay.replayId} className="truncate font-mono text-[10px] text-muted">
          {replay.replayId}
        </div>
        <div className="mt-3 text-[10px] leading-5 text-tertiary">
          This desktop build has no Replay viewer route yet. The association and session metadata
          are available, but playback is not exposed here.
        </div>
        {replays.length > 1 && (
          <div className="mt-2 text-[9px] text-tertiary">
            {replays.length} replay sessions reference this event.
          </div>
        )}
      </div>
      <div className="glass-control grid grid-cols-3 gap-4 rounded-[12px] p-3 @min-[760px]:grid-cols-1">
        <ReplayMetric label="Started" value={formatDateTime(replay.startedAt)} />
        <ReplayMetric label="Duration" value={formatDuration(replay.durationMs)} />
        <ReplayMetric label="Segments" value={replay.segmentCount.toLocaleString()} />
        <ReplayMetric label="Platform" value={replay.platform ?? "Not captured"} />
        <ReplayMetric label="Environment" value={replay.environment ?? "Not captured"} />
      </div>
    </div>
  );
}

function ReplayMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[9px] font-[700] tracking-[0.07em] text-tertiary uppercase">
        {label}
      </div>
      <div title={value} className="truncate text-[10px] text-muted">
        {value}
      </div>
    </div>
  );
}

function RawPayloadModule({ payload }: { payload: Record<string, unknown> | undefined }) {
  return (
    <section className="glass-panel overflow-hidden rounded-[16px]">
      <details className="group">
        <summary className="flex min-h-11.5 cursor-pointer list-none items-center gap-2 px-3.5 text-[11px] font-[620] text-muted">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          Raw event payload
          <span className="ml-auto font-mono text-[9px] text-tertiary">JSON</span>
        </summary>
        <pre className="m-0 max-h-[480px] overflow-auto border-t border-hairline bg-code-bg p-4 font-mono text-[10px] leading-6 whitespace-pre text-code-text">
          {payload ? JSON.stringify(payload, null, 2) : "No event selected."}
        </pre>
      </details>
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-[11px] text-tertiary">{children}</div>;
}

function formatDateTime(value: Date | string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "Not captured";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
