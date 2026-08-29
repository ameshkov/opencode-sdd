#!/usr/bin/env bash
# Starts the gateway (qa/docker-compose.yml, service `bifrost`) and waits
# until it is healthy. Prints the base URL(s) opencode should use.
#
# The OpenRouter key is only needed when the bifrost container does not
# exist yet. A restart of an existing container is done via
# `docker compose start` (see below), which keeps the key that was
# provided when it was created — no re-entry needed mid-session.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"

# shellcheck source=lib-openrouter-key.sh
source "$REPO_ROOT/qa/scripts/setup/lib-openrouter-key.sh"

# Optional host publishing (host-side smoke tests only):
#   QA_HOST_PORT=8080 qa/scripts/setup/llm-up.sh
# includes the ports override and publishes that host port. Without it the
# stack is hermetic — no host port is bound, so nothing can collide with
# the host.
COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [ -n "${QA_HOST_PORT:-}" ]; then
  COMPOSE_ARGS+=(-f "$REPO_ROOT/qa/docker-compose.ports.yml")
  BIFROST_PORT="$QA_HOST_PORT"
  export BIFROST_PORT
fi

PORT="${BIFROST_PORT:-8080}"

# On a macOS sandbox VM the published port is reachable via the NAT gateway
# (not localhost); fall back to it when localhost does not answer.
GATEWAY="$(route -n get default 2>/dev/null | awk '/gateway:/{print $2}')"
HEALTH_URL="http://localhost:$PORT/health"
HEALTH_URL_ALT="${GATEWAY:+http://$GATEWAY:$PORT/health}"

health_ok() {
  # Preferred probe: via the workspace container's curl (the compose
  # network does the routing; no host port needed).
  if [ -n "$(docker compose "${COMPOSE_ARGS[@]}" ps -q qa 2>/dev/null)" ] \
    && docker compose "${COMPOSE_ARGS[@]}" exec -T qa \
      curl -fsS http://bifrost:8080/health >/dev/null 2>&1; then
    return 0
  fi
  # Gateway-only stack (workspace not running): probe from a one-off
  # busybox container on the stack network (tiny image, no curl needed
  # in the bifrost image).
  docker run --rm --network opencode-sdd-qa_default \
    busybox:1.36.1 wget -qO- http://bifrost:8080/health >/dev/null 2>&1 \
    && return 0
  # Host-side probes for the opt-in ports override: localhost first, then
  # the NAT gateway on a macOS sandbox VM.
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1 \
    || { [ -n "$HEALTH_URL_ALT" ] && curl -fsS "$HEALTH_URL_ALT" >/dev/null 2>&1; }
}

# The key is only needed for CREATING the container. Restarting an
# existing container must use `docker compose start` (NOT `up -d`):
# `up -d` re-interpolates the compose file against the current shell
# environment, so a restart with the key unset would silently RECREATE
# the container with an empty OPENROUTER_API_KEY and break the provider.
# `start` reuses the container as-created (env + data volume intact).
BIFROST_EXISTS="$(docker compose "${COMPOSE_ARGS[@]}" ps -a -q bifrost 2>/dev/null || true)"
if [ -n "$BIFROST_EXISTS" ]; then
  docker compose "${COMPOSE_ARGS[@]}" start bifrost
else
  resolve_openrouter_key
  docker compose "${COMPOSE_ARGS[@]}" up -d bifrost
fi

echo "Waiting for bifrost health..."
if health_ok; then
  echo "health OK"
else
  for i in $(seq 1 60); do
    sleep 5
    if health_ok; then
      echo "health OK after $((i * 5))s"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "ERROR: gateway did not become healthy. Check logs:"
      echo "  docker compose -f $COMPOSE_FILE logs -f bifrost"
      exit 1
    fi
  done
fi

# Detect opt-in host publishing (qa/docker-compose.ports.yml) so host-side
# URLs are only printed when a port is actually bound.
# (`docker compose port` mis-reports an unbound expose as "invalid IP:0",
# so query the raw docker port of the container instead.)
BIFROST_ID="$(docker compose "${COMPOSE_ARGS[@]}" ps -q bifrost 2>/dev/null || true)"
PUBLISHED="$(docker port "${BIFROST_ID:+$BIFROST_ID}" 8080 2>/dev/null || true)"

echo
echo "Gateway is ready. Base URL for opencode:"
echo "  in workspace: http://bifrost:8080/v1 (compose DNS, always available)"
if [ -n "$PUBLISHED" ]; then
  echo "  host (normal machine): http://localhost:$PORT"
  [ -n "${GATEWAY:-}" ] && echo "  host (sandbox VM):    http://$GATEWAY:$PORT"
else
  echo "  host: no port published; add qa/docker-compose.ports.yml for host-side access"
fi
echo
echo "If this was a fresh stack (no bifrost-data volume yet), re-run"
echo "qa/scripts/setup/qa-up.sh once: it provisions the provider and enables"
echo "request logging. A restart of an existing gateway needs no key."
echo
echo "Host-side smoke: qa/docker/llm-smoke.sh (requires the ports override);"
echo "workspace smoke: docker compose -f $COMPOSE_FILE exec qa bash -lc '/app/qa/docker/llm-smoke.sh'"
