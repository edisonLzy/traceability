import multipart, { type MultipartFile } from "@fastify/multipart";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { requireFastifyAuthentication } from "../../helper/auth.js";

const DEBUG_ID_REGEX = /^[0-9a-f-]{8,128}$/i;

/**
 * `POST /api/sourcemaps/upload` — multipart upload of a single `.map` file plus
 * the metadata needed to key it. Each request handles one artifact so failures
 * are isolated; the CLI issues one call per map with bounded concurrency.
 */
export const sourcemapsUploadRoute: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: {
      fileSize: app.config.sourcemapMaxBytes,
      files: 1,
      fields: 8,
    },
  });

  app.post(
    "/api/sourcemaps/upload",
    { preHandler: requireFastifyAuthentication },
    async (request, reply) => {
      let projectSlug: string | undefined;
      let debugId: string | undefined;
      let fileName: string | undefined;
      let mapFile: MultipartFile | undefined;

      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (mapFile) return badRequest(reply, "only one file part is allowed");
          mapFile = part;
          // The stream MUST be drained before we move to the next part. Buffer it
          // now — @fastify/multipart requires this per its docs.
          const body = await part.toBuffer();
          // Re-shape as a plain object we can carry forward.
          Object.assign(part, { _buffer: body });
        } else if (part.type === "field") {
          if (part.fieldname === "projectSlug") projectSlug = String(part.value);
          else if (part.fieldname === "debugId") debugId = String(part.value);
          else if (part.fieldname === "fileName") fileName = String(part.value);
        }
      }

      if (!projectSlug) return badRequest(reply, "projectSlug is required");
      if (!debugId) return badRequest(reply, "debugId is required");
      if (!DEBUG_ID_REGEX.test(debugId)) return badRequest(reply, "debugId is malformed");
      if (!mapFile) return badRequest(reply, "map file part is required");
      const body = (mapFile as unknown as { _buffer: Buffer })._buffer;
      if (!body || body.byteLength === 0) return badRequest(reply, "map body is empty");

      const project = await app.container.projects.getProjectBySlug(projectSlug);
      if (!project) return reply.code(404).send({ code: "project_not_found" });

      const result = await app.container.sourcemaps.upload({
        projectId: project.id,
        debugId,
        fileName: fileName ?? mapFile.filename ?? `${debugId}.map`,
        body,
      });

      return reply.code(200).send({
        id: result.row.id,
        debugId: result.row.debugId,
        sizeBytes: result.row.sizeBytes,
        sha256: result.row.sha256,
        reused: result.reused,
      });
    },
  );
};

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: "bad_request", message });
}
