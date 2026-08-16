import { useAssistantBlock } from "@extensions/core/renderer";
import type { AssistantBlockRenderProps } from "@extensions/core/renderer";
import type { AssistantBlockDescriptor } from "@shared/assistant-block";
import type { ComponentType, ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface AssistantBlockViewProps {
  block: AssistantBlockDescriptor;
  raw?: string;
}

export function AssistantBlockView({ block, raw }: AssistantBlockViewProps) {
  const registration = useAssistantBlock(block.type);
  const serialized = raw ?? serialize({ type: block.type, props: block.props });

  if (!registration) {
    return (
      <AssistantBlockFailure
        block={block}
        reasons={[`No component is registered for "${block.type}".`]}
      />
    );
  }

  let props: unknown = block.props;
  if ("definition" in registration) {
    const result = registration.definition.propsSchema.safeParse(block.props);
    if (!result.success) {
      return (
        <AssistantBlockFailure
          block={block}
          reasons={result.error.issues.map((issue) => {
            const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
            return `${path}${issue.message}`;
          })}
        />
      );
    }
    props = result.data;
  } else if (!isRecord(props)) {
    return (
      <AssistantBlockFailure
        block={block}
        reasons={["Legacy assistant blocks require an object props value."]}
      />
    );
  }

  const Block = registration.render as ComponentType<AssistantBlockRenderProps<unknown>>;
  return (
    <AssistantBlockErrorBoundary key={serialized} block={block}>
      <Block props={props} raw={serialized} />
    </AssistantBlockErrorBoundary>
  );
}

export function AssistantBlockFailure({
  block,
  reasons,
}: {
  block: AssistantBlockDescriptor;
  reasons: string[];
}) {
  return (
    <div className="not-prose my-2 rounded-md border border-danger/30 bg-danger/[0.06] px-2.5 py-2 text-[10px] text-danger">
      <div className="font-[650]">Assistant component could not be rendered</div>
      <div className="mt-1 font-mono text-[9px] text-danger/80">{block.type || "unknown"}</div>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
        {reasons.map((reason, index) => (
          <li key={`${index}-${reason}`}>{reason}</li>
        ))}
      </ul>
      <details className="mt-2 text-muted">
        <summary className="cursor-pointer select-none text-[9px] text-tertiary">Raw props</summary>
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-black/20 p-2 text-[9px] leading-4 whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">
          {serialize(block.props)}
        </pre>
      </details>
    </div>
  );
}

interface AssistantBlockErrorBoundaryProps {
  block: AssistantBlockDescriptor;
  children: ReactNode;
}

interface AssistantBlockErrorBoundaryState {
  error?: Error;
}

class AssistantBlockErrorBoundary extends Component<
  AssistantBlockErrorBoundaryProps,
  AssistantBlockErrorBoundaryState
> {
  public state: AssistantBlockErrorBoundaryState = {};

  public static getDerivedStateFromError(error: Error): AssistantBlockErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Assistant block render failed", error, info);
  }

  public render() {
    if (this.state.error) {
      return (
        <AssistantBlockFailure
          block={this.props.block}
          reasons={[this.state.error.message || "The component threw while rendering."]}
        />
      );
    }
    return this.props.children;
  }
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
