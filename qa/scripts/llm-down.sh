#!/usr/bin/env bash
# Stops the local LLM container. The model cache volume is kept.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"

docker compose -f "$COMPOSE_FILE" down

echo "llama-server stopped. Model cache is kept in the 'llama-cache' volume."
