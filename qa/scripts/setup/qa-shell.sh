#!/usr/bin/env bash
# Opens an interactive shell inside the QA workspace container.
# Requires the stack to be up (qa/scripts/setup/qa-up.sh).
# Honors QA_ENV=v1|v2 (default v1) so it attaches to the matching stack.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# shellcheck source=lib-compose.sh
source "$REPO_ROOT/qa/scripts/setup/lib-compose.sh"

exec docker compose "${QA_COMPOSE_ARGS[@]}" exec -it qa bash
