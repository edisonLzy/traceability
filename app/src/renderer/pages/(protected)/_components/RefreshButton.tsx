import { useRegisterCommands } from "@renderer/commands";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

/** Owns the refresh action, its header button, and its command registration. */
export function RefreshButton() {
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries();
    toast("Monitoring data refreshed");
  }, [queryClient]);

  useRegisterCommands(
    () => [
      {
        id: "monitor.refresh",
        group: { id: "monitor", label: "Monitor", order: 20 },
        title: "Refresh monitoring data",
        description: "Reload issues and performance data",
        icon: RefreshCw,
        keywords: ["reload"],
        shortcut: "R",
        action: refresh,
      },
    ],
    [refresh],
  );

  return (
    <button
      type="button"
      onClick={refresh}
      title="Refresh data"
      className="grid size-7 place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/10 hover:text-ink"
    >
      <RefreshCw size={15} />
    </button>
  );
}
