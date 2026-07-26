import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../../config/index.js";
import type { Database } from "../../db/client.js";
import type { IngestionRateLimiter } from "../../infrastructure/rate-limit/project-rate-limiter.js";
import { IngestService } from "./service.js";

interface IngestRouteDependencies {
  config: RuntimeConfig;
  database: Database;
  rateLimiter?: IngestionRateLimiter;
}

export async function registerIngestRoutes(
  app: FastifyInstance,
  dependencies: IngestRouteDependencies,
) {
  const service = new IngestService(
    dependencies.database,
    {
      maxDecompressedBytes: dependencies.config.ingestMaxDecompressedBytes,
      maxItems: dependencies.config.ingestMaxItems,
      maxItemBytes: dependencies.config.ingestMaxItemBytes,
    },
    dependencies.rateLimiter,
  );

  const ingestEnvelope = async (
    request: {
      params: { projectId: string };
      query: { sentry_key?: string };
      body: unknown;
      headers: Record<string, string | string[] | undefined>;
      ip: string;
    },
    reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } },
  ) => {
    const result = await service.ingest({
      pathProjectId: request.params.projectId,
      body: request.body as Buffer,
      contentEncoding: firstHeaderValue(request.headers["content-encoding"]),
      origin: firstHeaderValue(request.headers.origin),
      userAgent: firstHeaderValue(request.headers["user-agent"]),
      clientIp: request.ip,
      publicKey:
        request.query.sentry_key ??
        extractPublicKey(firstHeaderValue(request.headers["x-sentry-auth"])),
    });

    return reply.code(200).send(result.eventId ? { id: result.eventId } : {});
  };

  app.post<{
    Params: { projectId: string };
    Querystring: { sentry_key?: string };
  }>("/api/:projectId/envelope/", ingestEnvelope);
  app.post<{
    Params: { projectId: string };
    Querystring: { sentry_key?: string };
  }>("/api/ingest/envelope/:projectId", ingestEnvelope);
}

function extractPublicKey(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const key = /(?:^|,)\s*sentry_key=([^,\s]+)/.exec(header)?.[1];
  return key ? decodeURIComponent(key) : undefined;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
