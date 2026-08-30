#!/usr/bin/env bash
# One-command baseline reset for a QA scratch project: wipes every
# artifact of the SDD flows, re-initialises the git repo to its initial
# commit, and rewires opencode.json. Runs INSIDE the workspace
# container (the whole repo is baked at /app).
#
# Usage: qa/docker/reset-scratch.sh [project-dir] [plugin-entry]
#   project-dir  defaults to /work/sdd-manual
#   plugin-entry defaults to file:///app (the baked plugin)
#
# Why the suite needs it: flow state leaks between cases — a later case
# can read an earlier one's artifacts (stale .sdd archives), and
# wizard/agent leftovers in opencode.json change what the next boot
# registers. Call this from a case's Given (or `pnpm qa:run
# --case-reset`) and every case starts from the documented baseline.
#
# What it does:
#   1. Removes every flow artifact from the project dir: .sdd/, the git
#      history, flow-created docs (README.md, CHANGELOG.md, ...), and the
#      wired opencode.json. node_modules is retained so the scaffold
#      install is not repeated.
#   2. Re-runs scratch-init.sh: src/math.ts + vitest + package.json are
#      reset to the scaffold content and a fresh initial commit is made.
#   3. Writes opencode.json via wire-opencode-config.sh (BIFROST_MODEL
#      passthrough: keep exporting it to re-wire with a different model).
#
# Deliberately NOT done here (host-side concerns): `docker compose down
# -v` (removes the qa-home/qa-work/bifrost-data volumes) — the container
# has no docker CLI; run it from the host on the host shell when even
# the volumes are stale.
set -euo pipefail

PROJECT="${1:-/work/sdd-manual}"
PLUGIN_ENTRY="${2:-file:///app}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$PROJECT" ]; then
  echo "ERROR: project dir not found: $PROJECT" >&2
  echo "  run scratch-init.sh first: qa/docker/scratch-init.sh $PROJECT" >&2
  exit 1
fi

echo "== reset $PROJECT =="

# 1. All flow artifacts (node_modules kept: the vitest install is done
#    once and reused across resets).
find "$PROJECT" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
echo "removed flow artifacts (.sdd/, git history, docs, configs)"

# 2. Fresh git history at the scaffold commit.
"$SCRIPT_DIR/scratch-init.sh" "$PROJECT"

# 3. Wired config (plugin + bifrost provider + allowlist models).
"$SCRIPT_DIR/wire-opencode-config.sh" "$PROJECT" "$PLUGIN_ENTRY"

echo
echo "reset done: $PROJECT is at its scaffold initial commit with a"
echo "wired opencode.json. (For stale VOLUMES too, run from the host:"
echo "  docker compose -f qa/docker-compose.yml down -v && qa/scripts/setup/qa-up.sh)"
