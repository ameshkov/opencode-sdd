#!/usr/bin/env bash
# Opens an interactive shell inside the QA workspace container.
# Requires the stack to be up (qa/scripts/setup/qa-up.sh).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"

exec docker compose -f "$COMPOSE_FILE" exec -it qa bash
