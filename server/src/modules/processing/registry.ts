import type { ReplayService } from "../replays/service.js";
import type { ProcessingService } from "./service.js";

export type ItemProcessor = (itemId: string) => Promise<void>;

export function createItemProcessors(
  service: ProcessingService,
  replays?: ReplayService,
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
  };
}
