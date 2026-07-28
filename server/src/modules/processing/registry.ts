import type { ProcessingService } from "./service.js";

export type ItemProcessor = (itemId: string) => Promise<void>;

export function createItemProcessors(
  service: ProcessingService,
): Readonly<Record<string, ItemProcessor>> {
  return {
    "ingest.event": (itemId) => service.processEventItem(itemId),
  };
}
