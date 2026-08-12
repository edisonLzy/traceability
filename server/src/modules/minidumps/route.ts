import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { createGunzip } from "node:zlib";

import busboy from "@fastify/busboy";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { requireFastifyAuthentication } from "../../helper/auth.js";
import { IngestRequestError } from "../ingest/service.js";

export const minidumpUploadRoute: FastifyPluginAsync = async (app) => {
  const bodyLimit = app.config.minidumpMaxBytes + app.config.ingestMaxItemBytes;
  app.addContentTypeParser(
    /^multipart\/form-data(?:;|$)/i,
    { parseAs: "buffer", bodyLimit },
    (_request, body, done) => done(null, body),
  );

  app.addHook("preParsing", async (request, _reply, payload) => {
    const contentEncoding = firstHeaderValue(request.headers["content-encoding"])?.toLowerCase();
    if (!contentEncoding || contentEncoding === "identity") return payload;
    if (contentEncoding !== "gzip") {
      throw new IngestRequestError(
        415,
        "unsupported_encoding",
        "minidump uploads only support identity or gzip content encoding",
      );
    }

    let receivedEncodedLength = 0;
    const countEncodedBytes = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        receivedEncodedLength += chunk.byteLength;
        callback(null, chunk);
      },
    });
    const gunzip = createGunzip();
    Object.defineProperty(gunzip, "receivedEncodedLength", {
      get: () => receivedEncodedLength,
    });
    payload.on("error", (error) => gunzip.destroy(error));
    countEncodedBytes.on("error", (error) => gunzip.destroy(error));
    payload.pipe(countEncodedBytes).pipe(gunzip);
    return gunzip;
  });

  app.post<{
    Params: { projectId: string };
    Querystring: { sentry_key?: string };
  }>("/api/:projectId/minidump/", { bodyLimit }, async (request, reply) => {
    const { fields, dumpFile } = await parseNativeCrashMultipart(
      request.body as Buffer,
      firstHeaderValue(request.headers["content-type"]),
      app.config.minidumpMaxBytes,
    );

    if (!dumpFile || dumpFile.body.byteLength === 0) {
      return badRequest(reply, "upload_file_minidump is required");
    }

    let event: Record<string, unknown>;
    try {
      event = nativeEventFromFields(fields);
    } catch {
      return badRequest(reply, "native event metadata is malformed");
    }
    const eventId = validEventId(event.event_id)
      ? event.event_id
      : randomUUID().replaceAll("-", "");
    event.event_id = eventId;
    event.platform = "native";
    event.level ??= "fatal";
    event.tags = {
      ...(isRecord(event.tags) ? event.tags : {}),
      "event.environment": "native",
      ...(fields.get("process_type") ? { "event.process": fields.get("process_type") } : {}),
    };

    const eventBody = Buffer.from(JSON.stringify(event));
    const envelope = Buffer.concat([
      Buffer.from(
        [
          JSON.stringify({ event_id: eventId }),
          JSON.stringify({
            type: "event",
            content_type: "application/json",
            length: eventBody.byteLength,
          }),
          "",
        ].join("\n"),
      ),
      eventBody,
      Buffer.from("\n"),
      Buffer.from(
        `${JSON.stringify({
          type: "attachment",
          attachment_type: "event.minidump",
          content_type: "application/x-dmp",
          filename: dumpFile.filename || `${eventId}.dmp`,
          length: dumpFile.body.byteLength,
        })}\n`,
      ),
      dumpFile.body,
    ]);

    const result = await app.container.ingest.ingest({
      pathProjectId: request.params.projectId,
      body: envelope,
      clientIp: request.ip,
      userAgent: request.headers["user-agent"],
      publicKey: request.query.sentry_key,
    });
    return reply.code(200).send({ id: result.eventId ?? eventId });
  });
};

export const minidumpDownloadRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { minidumpId: string } }>(
    "/api/minidumps/:minidumpId/download",
    { preHandler: requireFastifyAuthentication },
    async (request, reply) => {
      const result = await app.container.minidumps.download(request.params.minidumpId);
      if (!result) return reply.code(404).send({ code: "minidump_not_found" });
      const fileName = result.metadata.fileName.replace(/["\\\r\n]/g, "_");
      return reply
        .type(result.metadata.contentType)
        .header("content-disposition", `attachment; filename="${fileName}"`)
        .send(result.body);
    },
  );
};

function nativeEventFromFields(fields: Map<string, string>): Record<string, unknown> {
  const chunks = [...fields.entries()]
    .map(([key, value]) => ({ match: /^sentry__(\d+)$/.exec(key), value }))
    .filter((entry): entry is { match: RegExpExecArray; value: string } => Boolean(entry.match))
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  if (chunks.length > 0) {
    const parsed: unknown = JSON.parse(chunks.map((chunk) => chunk.value).join(""));
    if (!isRecord(parsed)) throw new Error("event metadata must be an object");
    return parsed;
  }

  const initialScope = fields.get("sentry___initialScope");
  if (!initialScope) return {};
  const parsed: unknown = JSON.parse(initialScope);
  if (!isRecord(parsed)) throw new Error("initial scope must be an object");
  return parsed;
}

function validEventId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: "bad_request", message });
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseNativeCrashMultipart(
  body: Buffer,
  contentType: string | undefined,
  maxFileBytes: number,
): Promise<{
  fields: Map<string, string>;
  dumpFile: { filename: string; body: Buffer } | undefined;
}> {
  if (!contentType) {
    return Promise.reject(new IngestRequestError(400, "invalid_multipart", "content type missing"));
  }

  return new Promise((resolve, reject) => {
    const fields = new Map<string, string>();
    let dumpFile: { filename: string; body: Buffer } | undefined;
    let failure: IngestRequestError | undefined;
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: { "content-type": contentType },
        limits: {
          fieldSize: 32 * 1024,
          fields: 256,
          fileSize: maxFileBytes,
          files: 1,
          parts: 257,
        },
      });
    } catch {
      reject(new IngestRequestError(400, "invalid_multipart", "multipart boundary is malformed"));
      return;
    }

    parser.on("field", (fieldName, value, _nameTruncated, valueTruncated) => {
      if (valueTruncated) {
        failure ??= new IngestRequestError(413, "field_too_large", "multipart field too large");
        return;
      }
      fields.set(fieldName, value);
    });
    parser.on("file", (fieldName, stream, filename) => {
      if (fieldName !== "upload_file_minidump" || dumpFile) {
        failure ??= new IngestRequestError(
          400,
          "invalid_multipart",
          "only upload_file_minidump is allowed",
        );
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        failure ??= new IngestRequestError(413, "minidump_too_large", "minidump too large");
      });
      stream.on("end", () => {
        if (!stream.truncated) dumpFile = { filename, body: Buffer.concat(chunks) };
      });
    });
    parser.on("filesLimit", () => {
      failure ??= new IngestRequestError(400, "invalid_multipart", "too many files");
    });
    parser.on("fieldsLimit", () => {
      failure ??= new IngestRequestError(413, "too_many_fields", "too many multipart fields");
    });
    parser.on("partsLimit", () => {
      failure ??= new IngestRequestError(413, "too_many_parts", "too many multipart parts");
    });
    parser.on("error", () => {
      reject(new IngestRequestError(400, "invalid_multipart", "multipart body is malformed"));
    });
    parser.on("finish", () => {
      if (failure) reject(failure);
      else resolve({ fields, dumpFile });
    });
    parser.end(body);
  });
}
