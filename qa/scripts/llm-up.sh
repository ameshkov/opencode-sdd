#!/usr/bin/env bash
# Starts the local LLM (qa/docker-compose.yml) and waits until it is healthy.
# Prints the base URL(s) opencode should use.
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

echo
echo "LLM is ready. Base URLs for opencode:"
echo "  normal machine:   http://localhost:$PORT/v1"
[ -n "${GATEWAY:-}" ] && echo "  macOS sandbox VM: http://$GATEWAY:$PORT/v1"
echo
echo "Then run: LLM_BASE_URL=<base-url>/v1 qa/scripts/llm-smoke.sh"
