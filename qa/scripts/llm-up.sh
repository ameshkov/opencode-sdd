#!/usr/bin/env bash
# Starts the local LLM (qa/docker-compose.yml) and waits until it is healthy.
# Prints the base URL(s) opencode should use.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"

# Optional host publishing (host-side smoke tests only):
#   QA_HOST_PORT=8080 qa/scripts/llm-up.sh
# includes the ports override and publishes that host port. Without it the
# stack is hermetic — no host port is bound, so nothing can collide with
# the host.
COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [ -n "${QA_HOST_PORT:-}" ]; then
  COMPOSE_ARGS+=(-f "$REPO_ROOT/qa/docker-compose.ports.yml")
  LLM_PORT="$QA_HOST_PORT"
  export LLM_PORT
fi

PORT="${LLM_PORT:-8080}"

# On a macOS sandbox VM the published port is reachable via the NAT gateway
# (not localhost); fall back to it when localhost does not answer.
GATEWAY="$(route -n get default 2>/dev/null | awk '/gateway:/{print $2}')"
HEALTH_URL="http://localhost:$PORT/health"
HEALTH_URL_ALT="${GATEWAY:+http://$GATEWAY:$PORT/health}"

health_ok() {
  # Authoritative probe: inside the llama-server container (no host port
  # published by default; the compose network does the routing).
  docker compose "${COMPOSE_ARGS[@]}" exec -T llama-server \
    curl -sf http://localhost:8080/health >/dev/null 2>&1 && return 0
  # Host-side probes for the opt-in ports override: localhost first, then
  # the NAT gateway on a macOS sandbox VM.
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1 \
    || { [ -n "$HEALTH_URL_ALT" ] && curl -fsS "$HEALTH_URL_ALT" >/dev/null 2>&1; }
}

docker compose "${COMPOSE_ARGS[@]}" up -d

echo "Waiting for llama-server health (first start downloads 4.8 GB)..."
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
      echo "ERROR: server did not become healthy. Check logs:"
      echo "  docker compose -f $COMPOSE_FILE logs -f llama-server"
      exit 1
    fi
  done
fi

# Detect opt-in host publishing (qa/docker-compose.ports.yml) so host-side
# URLs are only printed when a port is actually bound.
# (`docker compose port` mis-reports an unbound expose as "invalid IP:0",
# so query the raw docker port of the container instead.)
LLAMA_ID="$(docker compose "${COMPOSE_ARGS[@]}" ps -q llama-server 2>/dev/null || true)"
PUBLISHED="$(docker port "${LLAMA_ID:+$LLAMA_ID}" 8080 2>/dev/null || true)"

echo
echo "LLM is ready. Base URL for opencode:"
echo "  in workspace: http://llama-server:8080/v1 (compose DNS, always available)"
if [ -n "$PUBLISHED" ]; then
  echo "  host (normal machine): http://localhost:$PORT/v1"
  [ -n "${GATEWAY:-}" ] && echo "  host (sandbox VM):    http://$GATEWAY:$PORT/v1"
else
  echo "  host: no port published; add qa/docker-compose.ports.yml for host-side access"
fi
echo
echo "Host-side smoke: qa/scripts/llm-smoke.sh (requires the ports override);"
echo "workspace smoke: docker compose -f $COMPOSE_FILE exec qa bash -lc '/app/qa/scripts/llm-smoke.sh'"
