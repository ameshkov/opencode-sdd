#!/usr/bin/env bash
# Stops the gateway (compose service `bifrost`) for the TC-ROB-05 "LLM
# down" case. The container is NOT removed: its environment keeps the
# OpenRouter key reference, and the bifrost-data volume keeps the
# provider config + request logs, so `qa/scripts/setup/llm-up.sh` restarts
# without re-entering the key or re-provisioning.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"

docker compose -f "$COMPOSE_FILE" stop bifrost

echo "bifrost stopped (container + volume kept)."
echo "  restart:        qa/scripts/setup/llm-up.sh (no key needed)"
echo "  full teardown:  docker compose -f $COMPOSE_FILE down"
echo "  full reset:     docker compose -f $COMPOSE_FILE down -v"
