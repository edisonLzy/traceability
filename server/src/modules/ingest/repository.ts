import type { Database } from "../../infrastructure/database/client.js";
import { ingestEnvelopes, ingestItems, outcomes, outbox } from "./schema.js";

export interface ProjectContext {
  projectId: string;
  projectKeyId: string;
  allowedOrigins: string[];
  enabledItemTypes: string[];
  rateLimitPerSecond: number;
}

export interface PreparedItem {
  sequence: number;
  type: string;
  header: Record<string, unknown>;
  payload: Buffer | null;
  payloadJson: Record<string, unknown> | null;
  eventId: string | null;
  status: "pending" | "ignored" | "invalid";
  errorCode: string | null;
}

export class IngestRepository {
  public constructor(private readonly database: Database) {}

  async persist(input: {
    project: ProjectContext;
    sentAt: Date | null;
    origin?: string;
    userAgent?: string;
    checksum: string;
    sanitizedEnvelope: Buffer;
    items: PreparedItem[];
  }) {
    return this.database.db.transaction(async (transaction) => {
      const [storedEnvelope] = await transaction
        .insert(ingestEnvelopes)
        .values({
          projectId: input.project.projectId,
          projectKeyId: input.project.projectKeyId,
          sentAt: input.sentAt,
          origin: input.origin,
          userAgent: input.userAgent,
          checksum: input.checksum,
          sanitizedEnvelope: input.sanitizedEnvelope,
          itemCount: input.items.length,
        })
        .returning();
      if (!storedEnvelope) throw new Error("ingest envelope insert did not return a row");

      const storedItems = [];
      for (const item of input.items) {
        const [storedItem] = await transaction
          .insert(ingestItems)
          .values({
            envelopeId: storedEnvelope.id,
            sequence: item.sequence,
            type: item.type,
            header: item.header,
            payload: item.payload,
            payloadJson: item.payloadJson,
            eventId: item.eventId,
            status: item.status,
            errorCode: item.errorCode,
          })
          .returning();
        if (!storedItem) throw new Error("ingest item insert did not return a row");
        storedItems.push(storedItem);

        await transaction.insert(outcomes).values({
          envelopeId: storedEnvelope.id,
          itemId: storedItem.id,
          category: item.status === "pending" ? "accepted" : item.status,
          reason: item.errorCode ?? (item.status === "pending" ? "accepted" : "unsupported_item"),
        });

        if (item.status === "pending") {
          await transaction.insert(outbox).values({
            itemId: storedItem.id,
            topic: `ingest.${item.type}`,
            payload: { itemId: storedItem.id },
          });
        }
      }

      return { envelope: storedEnvelope, items: storedItems };
    });
  }
}
