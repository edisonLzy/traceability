import { useAssistantBlock } from "@extensions/core/renderer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { cn } from "@renderer/lib/utils";
import type { ToolExecutionState } from "@renderer/store/agent";
import { ChevronDownIcon, SquareTerminalIcon } from "lucide-react";
import { useState } from "react";

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
  const command = formatToolCommand(toolName, args);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {descriptor && Block ? (
        <Block props={{ ...descriptor.props, sessionId }} raw={JSON.stringify(descriptor)} />
      ) : null}

      <Collapsible className="min-w-0" open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
        <CollapsibleTrigger
          aria-label={`Toggle ${toolName} tool details`}
          className="group/tool flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-[5px] px-0.5 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-overlay hover:text-foreground"
        >
          <SquareTerminalIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-tertiary"
            strokeWidth={1.65}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              isRunning && "animate-pulse text-muted-foreground",
              toolState?.status === "error" && "text-danger",
            )}
          >
            {statusLabel(toolState?.status, toolName, command)}
          </span>
          <ChevronDownIcon
            className={cn(
              "mr-0.5 size-3.5 shrink-0 text-tertiary transition-transform duration-200 ease-out",
              isOpen ? "rotate-0" : "-rotate-90",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-1 max-w-full">
          <div className="overflow-hidden rounded-[9px] border border-hairline bg-muted-surface/60 px-2.5 py-2">
            <div className="mb-1 text-xs leading-5 text-muted-foreground">
              {toolLabel(toolName)}
            </div>
            <pre className="m-0 overflow-x-auto font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
              <span className="select-none text-tertiary">$ </span>
              {command}
            </pre>
            {output ? (
              <pre
                className={cn(
                  "mt-1.5 mb-0 max-h-72 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap text-card-foreground [overflow-wrap:anywhere]",
                  toolState?.status === "error" && "text-danger",
                )}
              >
                {output}
              </pre>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function statusLabel(
  status: ToolExecutionState["status"] | undefined,
  toolName: string,
  command: string,
): string {
  switch (status) {
    case "done":
      return "已运行命令";
    case "error":
      return `运行失败 ${toolLabel(toolName)}`;
    case "running":
      return `正在运行 ${command}`;
    default:
      return `准备运行 ${toolLabel(toolName)}`;
  }
}

function formatToolCommand(toolName: string, value: unknown): string {
  if (toolName === "terminal_create" && isRecord(value) && typeof value.command === "string") {
    return value.command;
  }

  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function toolLabel(toolName: string): string {
  if (toolName === "terminal_create") return "Shell";
  return toolName
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
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
