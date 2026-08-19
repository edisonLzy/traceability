import { Button } from "@renderer/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { NodeDetailViewProps } from ".";

export function ReplayNodeDetail({ node }: NodeDetailViewProps) {
  const navigate = useNavigate();
  const data = node.data;
  if (data.kind !== "replay") return null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">
          Replay ID
        </h3>
        <code className="rounded-sm border border-hairline bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink">
          {data.replayId}
        </code>
      </section>

      <Button
        className="w-fit"
        onClick={() => navigate(`/monitor/replays/${data.replayId}`)}
        type="button"
        variant="primary"
      >
        <ExternalLink className="size-3.5" />
        Open in Replay Monitor
      </Button>
    </div>
  );
}
