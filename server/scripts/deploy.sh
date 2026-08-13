#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_DIR="${TRACEABILITY_DEPLOY_DIR:-/opt/traceability}"
REPO_DIR="${TRACEABILITY_REPO_DIR:-$DEPLOY_DIR/repo}"
ENV_FILE="$DEPLOY_DIR/.env"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-traceability}"
COMPOSE_FILE="$REPO_DIR/server/compose.production.yml"
DEPLOY_COMMIT="${DEPLOY_COMMIT:-}"

log() {
  printf '[traceability] %s\n' "$*"
}

fail() {
  printf '[traceability] ERROR: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "docker is required"
[ -f "$ENV_FILE" ] || fail "missing $ENV_FILE"

mkdir -p "$DEPLOY_DIR"
chmod 0755 "$DEPLOY_DIR"

[ -f "$COMPOSE_FILE" ] || fail "missing $COMPOSE_FILE"

if [ -n "$DEPLOY_COMMIT" ]; then
  log "deploying source release $DEPLOY_COMMIT"
else
  log "deploying source release from $REPO_DIR"
fi

compose() {
  docker compose \
    --project-name "$COMPOSE_PROJECT" \
    --env-file "$ENV_FILE" \
    --file "$COMPOSE_FILE" \
    "$@"
}

log "validating compose configuration"
compose config --quiet

log "building server image"
DOCKER_BUILDKIT=1 compose build migrate api dispatcher worker

log "starting server and dependencies"
compose up -d api dispatcher worker

PORT="$(awk -F= '/^TRACEABILITY_PORT=/{print $2}' "$ENV_FILE" | tail -n 1)"
PORT="${PORT:-3000}"

log "waiting for readiness on 127.0.0.1:$PORT"
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 3 \
    "http://127.0.0.1:$PORT/health/ready" >/dev/null 2>&1; then
    log "server is ready"
    compose ps
    exit 0
  fi
  sleep 2
done

compose ps
compose logs --tail 100 api dispatcher worker
fail "server did not become ready within 120 seconds"
