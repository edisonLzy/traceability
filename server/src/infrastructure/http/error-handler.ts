import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { IngestRequestError } from "../../domains/ingest/service.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof IngestRequestError) {
      if (error.retryAfterSeconds) reply.header("retry-after", error.retryAfterSeconds);
      return reply.code(error.statusCode).send({ detail: error.message, code: error.code });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ code: "invalid_request", issues: error.issues });
    }
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const code = error.statusCode === 413 ? "request_too_large" : "invalid_request";
      return reply.code(error.statusCode).send({ code });
    }
    app.log.error(error);
    return reply.code(500).send({ code: "internal_error" });
  });
}
