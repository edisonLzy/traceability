import { useAssistantBlock } from "@extensions/core/renderer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { cn } from "@renderer/lib/utils";
import type { ToolExecutionState } from "@renderer/store/agent";
import { ChevronRightIcon } from "lucide-react";

interface AssistantToolMessageProps {
  args: unknown;
  defaultOpen?: boolean;
  sessionId: string;
  toolName: string;
  toolState?: ToolExecutionState;
}

export function AssistantToolMessage({
  args,
  defaultOpen = false,
  sessionId,
  toolName,
  toolState,
}: AssistantToolMessageProps) {
  const descriptor = getAssistantBlockDescriptor(toolState?.details);
  const registration = useAssistantBlock(descriptor?.type ?? "");
  const Block = registration?.render;
  const isRunning = toolState?.status === "running";
  const output = toolState?.output ?? "";

  return (
    <div className="flex flex-col gap-2">
      {descriptor && Block ? (
        <Block props={{ ...descriptor.props, sessionId }} raw={JSON.stringify(descriptor)} />
      ) : null}

      <Collapsible
        className="overflow-hidden rounded-md border-2 border-ink bg-card shadow-[var(--hard-shadow)]"
        defaultOpen={defaultOpen}
      >
        <CollapsibleTrigger
          aria-label={`Toggle ${toolName} tool details`}
          className="group/tool flex min-h-12 w-full cursor-pointer items-center gap-2 text-sm"
        >
          <span className="flex min-h-12 self-stretch items-center border-r-2 border-ink bg-signal-cyan px-2 font-mono text-[8px] font-bold text-[#102047]">
            TOOL
          </span>
          <span
            className={cn(
              "text-xs text-muted-foreground",
              isRunning && "animate-pulse",
              toolState?.status === "error" && "text-danger",
            )}
          >
            {`${statusLabel(toolState?.status)} ${toolName}`}
          </span>
          <ChevronRightIcon className="mr-3 ml-auto size-3.5 text-muted-foreground transition-transform group-data-panel-open/tool:rotate-90" />
        </CollapsibleTrigger>

        <CollapsibleContent className="border-t-2 border-ink bg-muted-surface p-3">
          <div className="flex flex-col gap-3">
            <section className="rounded-md border-2 border-ink bg-card p-3">
              <div className="mb-2 text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Input
              </div>
              <pre className="m-0 overflow-x-auto text-xs leading-6 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                {formatToolArgs(args) || "{}"}
              </pre>
            </section>

            <section className="rounded-md border-2 border-ink bg-card p-3">
              <pre
                className={cn(
                  "m-0 min-h-6 overflow-x-auto text-xs leading-6 whitespace-pre-wrap text-card-foreground [overflow-wrap:anywhere]",
                  toolState?.status === "error" && "text-danger",
                )}
              >
                {output}
              </pre>
            </section>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function statusLabel(status?: ToolExecutionState["status"]): string {
  switch (status) {
    case "done":
      return "已处理";
    case "error":
      return "错误";
    case "running":
      return "运行中";
    default:
      return "准备中";
  }
}

function formatToolArgs(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

interface AssistantBlockDescriptor {
  props: Record<string, unknown>;
  type: string;
}

function getAssistantBlockDescriptor(details: unknown): AssistantBlockDescriptor | null {
  if (!isRecord(details) || !isRecord(details.assistantBlock)) return null;
  const { assistantBlock } = details;
  if (typeof assistantBlock.type !== "string") return null;
  return {
    props: isRecord(assistantBlock.props) ? assistantBlock.props : {},
    type: assistantBlock.type,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
