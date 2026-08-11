import type { MetricsService } from "../metrics/service.js";
import type { MinidumpService } from "../minidumps/service.js";
import type { ReplayService } from "../replays/service.js";
import type { TraceService } from "../traces/service.js";
import type { ProcessingService } from "./service.js";

export type ItemProcessor = (itemId: string) => Promise<void>;

export function createItemProcessors(
  service: ProcessingService,
  replays?: ReplayService,
  traces?: TraceService,
  metrics?: MetricsService,
  minidumps?: MinidumpService,
): Readonly<Record<string, ItemProcessor>> {
  return {
    "ingest.event": (itemId) => service.processEventItem(itemId),
    "ingest.replay_event": (itemId) => {
      if (!replays) throw new Error("ReplayService not available");
      return replays.processReplayEventItem(itemId);
    },
    "ingest.replay_recording": (itemId) => {
      if (!replays) throw new Error("ReplayService not available");
      return replays.processReplayRecordingItem(itemId);
    },
    "ingest.transaction": (itemId) => {
      if (!traces) throw new Error("TraceService not available");
      return traces.processTransactionItem(itemId);
    },
    "ingest.span": (itemId) => {
      if (!traces) throw new Error("TraceService not available");
      return traces.processSpanItem(itemId);
    },
    "ingest.trace_metric": (itemId) => {
      if (!metrics) throw new Error("MetricsService not available");
      return metrics.processItem(itemId);
    },
    "ingest.attachment": (itemId) => {
      if (!minidumps) throw new Error("MinidumpService not available");
      return minidumps.processAttachmentItem(itemId);
    },
  };
}
