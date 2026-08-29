#!/usr/bin/env bash
# Starts the full QA stack: the bifrost/OpenRouter gateway + the isolated
# workspace container. Waits until the gateway is healthy, provisions it
# (provider + logging) and prints how to enter.
#
# The OpenRouter API key is resolved by lib-openrouter-key.sh: gitignored
# qa/.env -> exported env var -> external key file -> interactive hidden
# prompt. It is never committed and never echoed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"

# shellcheck source=lib-openrouter-key.sh
source "$REPO_ROOT/qa/scripts/setup/lib-openrouter-key.sh"

# Optional host publishing (host-side smoke tests + the bifrost Web UI):
#   QA_HOST_PORT=8080 qa/scripts/setup/qa-up.sh
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
  # Authoritative probe: via the workspace container's curl (no host port
  # published by default; the compose network does the routing). The qa
  # container itself waits for /health before finishing its boot.
  docker compose "${COMPOSE_ARGS[@]}" exec -T qa \
    curl -fsS http://bifrost:8080/health >/dev/null 2>&1 && return 0
  # Host-side probes for the opt-in ports override: localhost first, then
  # the NAT gateway on a macOS sandbox VM.
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1 \
    || { [ -n "$HEALTH_URL_ALT" ] && curl -fsS "$HEALTH_URL_ALT" >/dev/null 2>&1; }
}

# Human-gated: refuses to start without a key in non-interactive contexts.
resolve_openrouter_key

docker compose "${COMPOSE_ARGS[@]}" up -d

echo "Waiting for bifrost health (first start pulls the 315 MB image)..."
for i in $(seq 1 60); do
  if health_ok; then
    echo "health OK after $((i * 5))s"
    break
  fi
  sleep 5
  if [ "$i" -eq 60 ]; then
    echo "ERROR: gateway did not become healthy. Check logs:"
    echo "  docker compose -f $COMPOSE_FILE logs -f bifrost"
    exit 1
  fi
done

# Seed the gateway: OpenRouter provider (allowlist) + request logging.
# Idempotent; the provider settings persist in the bifrost-data volume.
echo "Provisioning the gateway..."
if docker compose "${COMPOSE_ARGS[@]}" exec -T qa \
  bash -lc '/app/qa/docker/bifrost-provision.sh'; then
  :
else
  echo "WARN: provisioning failed - the gateway was not configured."
  echo "      Re-run qa/scripts/setup/qa-up.sh after fixing the cause."
fi

# Detect opt-in host publishing (qa/docker-compose.ports.yml) so the
# summary only lists host-side URLs when a port is actually bound.
# (`docker compose port` mis-reports an unbound expose as "invalid IP:0",
# so query the raw docker port of the container instead.)
BIFROST_ID="$(docker compose "${COMPOSE_ARGS[@]}" ps -q bifrost 2>/dev/null || true)"
PUBLISHED="$(docker port "${BIFROST_ID:+$BIFROST_ID}" 8080 2>/dev/null || true)"

echo
echo "QA stack is ready."
echo "  workspace shell:  docker compose -f $COMPOSE_FILE exec -it qa bash"
echo "  opencode TUI:     docker compose -f $COMPOSE_FILE exec -it qa \\"
echo "                    bash -lc 'cd /work/sdd-manual && opencode'"
echo "  gateway (in workspace): http://bifrost:8080/v1 (compose DNS)"
if [ -n "${PUBLISHED:-}" ]; then
  echo "  gateway (from host):   http://localhost:$PORT"
  [ -n "${GATEWAY:-}" ] && echo "  gateway (sandbox VM):  http://$GATEWAY:$PORT"
  echo "  bifrost UI (logs):     http://localhost:$PORT/logs"
else
  echo "  gateway (host): no port published; add qa/docker-compose.ports.yml"
  echo "                for host-side access to the bifrost UI / smoke tests"
fi
echo
echo "  First-time setup inside the workspace:"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/docker/scratch-init.sh /work/sdd-manual'"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/docker/wire-opencode-config.sh /work/sdd-manual file:///app'"
echo
echo "  Smoke test the gateway:"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/docker/llm-smoke.sh'"
