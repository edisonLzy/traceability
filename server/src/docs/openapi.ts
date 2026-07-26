export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Traceability Server API",
    version: "1.0.0",
    description: "Sentry-compatible envelope ingestion plus the protected tRPC management API.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Health", description: "Process and dependency health" },
    { name: "Ingest", description: "Sentry envelope ingestion" },
    { name: "Management", description: "tRPC management procedures" },
  ],
  paths: {
    "/health/live": {
      get: {
        tags: ["Health"],
        summary: "Liveness probe",
        responses: { "200": { description: "Process is alive" } },
      },
    },
    "/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness probe",
        responses: {
          "200": { description: "Dependencies are ready" },
          "503": { description: "Dependencies are unavailable" },
        },
      },
    },
    "/api/{projectId}/envelope/": {
      post: envelopeOperation().post,
    },
    "/api/ingest/envelope/{projectId}": {
      post: {
        ...envelopeOperation().post,
        summary: "Compatibility envelope ingestion route",
      },
    },
    "/api/trpc/{procedure}": {
      get: trpcOperation(),
      post: trpcOperation(),
    },
  },
  components: {
    securitySchemes: {
      managementBearer: { type: "http", scheme: "bearer", bearerFormat: "token" },
    },
  },
} as const;

function envelopeOperation() {
  return {
    post: {
      tags: ["Ingest"],
      summary: "Ingest a Sentry envelope",
      parameters: [
        {
          name: "projectId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "sentry_key",
          in: "query",
          required: false,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/x-sentry-envelope": { schema: { type: "string", format: "binary" } },
        },
      },
      responses: {
        "200": { description: "Envelope accepted for durable processing" },
        "400": { description: "Invalid envelope" },
        "413": { description: "Envelope exceeds configured limits" },
        "429": { description: "Project rate limit exceeded" },
      },
    },
  };
}

function trpcOperation() {
  return {
    tags: ["Management"],
    summary: "tRPC management procedure",
    security: [{ managementBearer: [] }],
    parameters: [
      {
        name: "procedure",
        in: "path",
        required: true,
        schema: { type: "string", example: "projects.list" },
      },
      {
        name: "input",
        in: "query",
        required: false,
        schema: { type: "string", description: "JSON-encoded tRPC input" },
      },
    ],
    responses: {
      "200": { description: "tRPC result envelope" },
      "400": { description: "Invalid input" },
      "401": { description: "Management authentication required" },
      "404": { description: "Resource not found" },
    },
  };
}

export const swaggerUiHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Traceability API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => SwaggerUIBundle({ url: "/api-docs.json", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;
