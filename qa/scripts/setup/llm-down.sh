#!/usr/bin/env bash
# Stops the gateway (compose service `bifrost`) for the TC-ROB-05 "LLM
# down" case. The container is NOT removed: its environment keeps the
# OpenRouter key reference, and the bifrost-data volume keeps the
# provider config + request logs, so `qa/scripts/setup/llm-up.sh` restarts
# without re-entering the key or re-provisioning.
#
# Honors QA_ENV=v1|v2 (default v1).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# shellcheck source=lib-compose.sh
source "$REPO_ROOT/qa/scripts/setup/lib-compose.sh"

docker compose "${QA_COMPOSE_ARGS[@]}" stop bifrost

echo "bifrost stopped (container + volume kept)."
echo "  restart:        qa/scripts/setup/llm-up.sh (no key needed)"
echo "  full teardown:  docker compose ${QA_COMPOSE_ARGS[*]} down"
echo "  full reset:     docker compose ${QA_COMPOSE_ARGS[*]} down -v"
