import type { Database } from "../../db/client.js";
import { processEventItem } from "./event-handler.js";

export type ItemProcessor = (database: Database, itemId: string) => Promise<void>;

/**
 * The public envelope endpoint never needs to know which item types exist.
 * New Envelope support is introduced by adding a processor here and a queue
 * policy, without changing protocol parsing or durable ingestion.
 */
export const itemProcessors: Readonly<Record<string, ItemProcessor>> = {
  "ingest.event": processEventItem,
};
