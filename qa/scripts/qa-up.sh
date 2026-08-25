#!/usr/bin/env bash
# Starts the full QA stack: llama-server (LLM) + the isolated workspace
# container. Waits until the LLM is healthy, then prints how to enter.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"
PORT="${LLM_PORT:-8080}"

# On a macOS sandbox VM the published port is reachable via the NAT gateway
# (not localhost); fall back to it when localhost does not answer.
GATEWAY="$(route -n get default 2>/dev/null | awk '/gateway:/{print $2}')"
HEALTH_URL="http://localhost:$PORT/health"
HEALTH_URL_ALT="${GATEWAY:+http://$GATEWAY:$PORT/health}"

health_ok() {
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1 \
    || { [ -n "$HEALTH_URL_ALT" ] && curl -fsS "$HEALTH_URL_ALT" >/dev/null 2>&1; }
}

docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for llama-server health (first start downloads 4.8 GB)..."
for i in $(seq 1 60); do
  if health_ok; then
    echo "health OK after $((i * 5))s"
    break
  fi
  sleep 5
  if [ "$i" -eq 60 ]; then
    echo "ERROR: LLM did not become healthy. Check logs:"
    echo "  docker compose -f $COMPOSE_FILE logs -f llama-server"
    exit 1
  fi
done

echo
echo "QA stack is ready."
echo "  workspace shell:  docker compose -f $COMPOSE_FILE exec -it qa bash"
echo "  opencode TUI:     docker compose -f $COMPOSE_FILE exec -it qa \\"
echo "                    bash -lc 'cd /work/sdd-manual && opencode'"
echo "  LLM (in container): http://llama-server:8080/v1"
echo "  LLM (from host):    http://localhost:$PORT/v1"
[ -n "${GATEWAY:-}" ] && echo "  LLM (sandbox VM):  http://$GATEWAY:$PORT/v1"
echo
echo "  First-time setup inside the workspace:"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/scripts/scratch-init.sh /work/sdd-manual'"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/scripts/wire-opencode-config.sh /work/sdd-manual file:///app'"
