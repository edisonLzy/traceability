FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /workspace

# ---------------------------------------------------------------------------
# 1. Prune: use `turbo prune` to emit a minimal workspace containing only
#    @traceability/server and its workspace dependencies (currently none).
#    Produces:
#      out/json/  -> package.json files + pnpm-lock.yaml (for install)
#      out/full/  -> pruned source tree (for build)
# ---------------------------------------------------------------------------
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.5.8 prune @traceability/server --docker

# ---------------------------------------------------------------------------
# 2. Install: install deps against the pruned manifest tree. Cached as long
#    as no package.json / lockfile changed under the pruned graph.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner /workspace/out/json/ ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# 3. Build: run `pnpm --filter @traceability/server build` against the pruned
#    source tree. Only server sources trigger rebuilds.
#
#    `turbo prune` does not carry root-level tsconfig files, but the server's
#    tsconfig.json extends `../tsconfig.base.json` — copy it in explicitly so
#    compilerOptions (skipLibCheck, strict, moduleResolution, …) are honored.
# ---------------------------------------------------------------------------
FROM deps AS build
COPY --from=pruner /workspace/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm --filter @traceability/server build
RUN pnpm --filter @traceability/server deploy --prod --legacy /runtime

# ---------------------------------------------------------------------------
# 4. Runtime: minimal image with the deployed server bundle.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system traceability && useradd --system --gid traceability --home-dir /app traceability

COPY --from=build --chown=traceability:traceability /runtime ./
# Drizzle migrations are runtime input for `dist/db/migrate.js` and are not
# included by `pnpm deploy`, which only copies package files and dependencies.
COPY --from=build --chown=traceability:traceability /workspace/server/drizzle ./drizzle

USER traceability
EXPOSE 3000

CMD ["node", "dist/app.js"]
