import { useRegisterCommands } from "@renderer/commands";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";
import { useCurrentProject } from "@renderer/context/current-project";
import { useIssue, useIssueEvents, useUpdateIssue } from "@renderer/hooks/use-issue";
import { promptAgent } from "@renderer/lib/agent-events";
import { cn, relativeTime, statusGroup } from "@renderer/lib/utils";
import { ArrowLeft, Check, CircleOff, Sparkles } from "lucide-react";
import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Stacktrace } from "./_components/Stacktrace";

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject } = useCurrentProject();
  const issueQuery = useIssue(id);
  const eventsQuery = useIssueEvents(id);
  const updateIssue = useUpdateIssue();
  const issue = issueQuery.data ?? null;
  const events = eventsQuery.data ?? [];

  const investigate = useCallback(() => {
    if (!issue) return;
    promptAgent({
      context: { projectId: issue.projectId, source: "issue", issueId: issue.id },
      prompt: `Investigate ${issue.id}`,
    });
  }, [issue]);

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
      {
        id: "issue.investigate",
        group: { id: "issue", label: "Current issue", order: 50 },
        title: "Investigate current issue",
        description: issue.title,
        icon: Sparkles,
        keywords: [issue.id, issue.fingerprint],
        action: investigate,
      },
    ];
  }, [investigate, issue, navigate]);

  const changeStatus = async (status: "unresolved" | "resolved" | "ignored") => {
    if (!issue) return;
    try {
      await updateIssue.mutateAsync({ issueId: issue.id, patch: { status } });
      toast("Issue status updated");
    } catch (cause) {
      toast(String(cause));
    }
  };

  if (!issue) {
    return (
      <div className="mx-auto block min-h-full max-w-[1260px] px-[22px] pt-[22px] pb-12">
        <div className="px-5 py-12 text-center text-[12px] text-tertiary">
          {issueQuery.isLoading ? "Loading…" : "Issue not found."}
        </div>
      </div>
    );
  }

  const group = statusGroup(issue.status);

  return (
    <div className="mx-auto block min-h-full max-w-[1260px] px-[22px] pt-[22px] pb-12">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-tertiary transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> Issues
      </button>

      <div className="mb-5 flex items-start gap-3">
        <span
          className={cn(
            "mt-2.5 size-2.5 shrink-0 rounded-full",
            issue.type === "error" ? "bg-danger" : "bg-warning",
          )}
        />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[24px] font-[680] leading-[1.12] tracking-[-0.04em]">
            {issue.title}
          </h1>
          <div className="mt-1.5 font-mono text-[11px] text-tertiary">
            {issue.id} · {currentProject?.name ?? issue.projectId}
          </div>
        </div>
        <button
          type="button"
          onClick={investigate}
          className="inline-flex h-8.5 items-center gap-1.5 rounded-[9px] border border-primary/40 bg-primary px-3 text-[12px] font-[590] text-[#111329] transition-colors hover:bg-primary-hover"
        >
          <Sparkles size={14} /> Investigate
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4.5 desktop:grid-cols-[minmax(0,1fr)_260px]">
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white/[0.025]">
          <div className="border-b border-hairline px-4 py-3 text-[12px] font-[630] text-muted">
            Event evidence · {events.length}
          </div>
          <div className="px-4 py-2">
            {events.map((event) => (
              <div className="border-b border-hairline py-3 last:border-b-0" key={event.id}>
                <div className="mb-2 text-[11px] text-tertiary">
                  {new Date(event.receivedAt).toLocaleString()}
                </div>
                <EventBody event={event} />
              </div>
            ))}
            {events.length === 0 && (
              <div className="px-5 py-12 text-center text-[12px] text-tertiary">No events.</div>
            )}
          </div>
        </section>

        <aside className="h-max overflow-hidden rounded-2xl border border-hairline bg-white/[0.025]">
          <div className="border-b border-hairline p-4">
            <div className="mb-1.5 text-[10px] font-[660] uppercase tracking-[0.08em] text-tertiary">
              Status
            </div>
            <StatusBadge group={group} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatusButton
                active={group === "unresolved"}
                label="Open"
                icon={CircleOff}
                onClick={() => void changeStatus("unresolved")}
              />
              <StatusButton
                active={group === "resolved"}
                label="Resolved"
                icon={Check}
                onClick={() => void changeStatus("resolved")}
              />
              <StatusButton
                active={group === "ignored"}
                label="Ignored"
                icon={CircleOff}
                onClick={() => void changeStatus("ignored")}
              />
            </div>
            <SideRow label="First seen" value={relativeTime(issue.firstSeen.toString())} />
            <SideRow label="Last seen" value={relativeTime(issue.lastSeen.toString())} />
            <SideRow label="Total events" value={`${issue.eventCount} events`} />
          </div>
          <div className="p-4">
            <SideRow label="Project" value={currentProject?.name ?? issue.projectId} />
            <SideRow label="Fingerprint" value={issue.fingerprint} />
            <SideRow label="Type" value={issue.type} last />
          </div>
        </aside>
      </div>
    </div>
  );
}

interface EventLike {
  id: string;
  payload: Record<string, unknown>;
}

/**
 * Show a stack-trace tab by default and a raw-JSON tab as escape hatch. When
 * the payload doesn't contain a stacktrace at all (message-only events),
 * we skip the tabbed layout and just show raw so the widget stays honest.
 */
function EventBody({ event }: { event: EventLike }) {
  const hasStack = payloadHasStacktrace(event.payload);
  if (!hasStack) return <RawPayload payload={event.payload} />;
  return (
    <Tabs defaultValue="stack" className="rounded-lg border border-hairline bg-white/[0.02]">
      <TabsList className="border-b-0 px-3 py-0">
        <TabsTrigger value="stack">Stack trace</TabsTrigger>
        <TabsTrigger value="raw">Raw payload</TabsTrigger>
      </TabsList>
      <TabsContent value="stack">
        <Stacktrace payload={event.payload} />
      </TabsContent>
      <TabsContent value="raw" className="px-4 py-3">
        <RawPayload payload={event.payload} />
      </TabsContent>
    </Tabs>
  );
}

function RawPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-[1.7] text-muted">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

function payloadHasStacktrace(payload: Record<string, unknown>): boolean {
  const exception = payload.exception;
  if (!exception || typeof exception !== "object" || Array.isArray(exception)) return false;
  const values = (exception as { values?: unknown }).values;
  if (!Array.isArray(values) || values.length === 0) return false;
  const first = values[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return false;
  const stacktrace = (first as { stacktrace?: unknown }).stacktrace;
  if (!stacktrace || typeof stacktrace !== "object" || Array.isArray(stacktrace)) return false;
  const frames = (stacktrace as { frames?: unknown }).frames;
  return Array.isArray(frames) && frames.length > 0;
}

function StatusBadge({ group }: { group: "unresolved" | "resolved" | "ignored" }) {
  const dot =
    group === "unresolved" ? "bg-danger" : group === "resolved" ? "bg-success" : "bg-muted";
  const label = group === "unresolved" ? "Open" : group === "resolved" ? "Resolved" : "Ignored";
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-hairline bg-white/[0.04] px-2 text-[10px] font-[600] text-muted">
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function StatusButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Check;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[10px] text-muted",
        active && "border-primary/60 bg-primary/10 text-ink",
      )}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

function SideRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn("mt-3 flex items-start justify-between gap-3", !last && "")}>
      <span className="text-[11px] text-tertiary">{label}</span>
      <span className="max-w-[150px] break-all text-right font-mono text-[10px] text-muted">
        {value}
      </span>
    </div>
  );
}
