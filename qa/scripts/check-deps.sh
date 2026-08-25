#!/usr/bin/env bash
# Checks the prerequisites for the manual QA suite (qa/testplan/README.md).
# Exits non-zero when something essential is missing.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail=0
note() { printf '%-9s %s\n' "$1" "$2"; }

echo "== opencode-sdd manual QA: prerequisite check =="

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    note PASS "docker engine $(docker info --format '{{.ServerVersion}}')"
  else
    note FAIL "docker engine not reachable - start it first"
    fail=1
  fi
else
  note FAIL "docker not on PATH"
  fail=1
fi

if [ -f "$REPO_ROOT/qa/docker-compose.yml" ]; then
  if docker compose -f "$REPO_ROOT/qa/docker-compose.yml" config --quiet; then
    note PASS "qa/docker-compose.yml parses (llm + workspace services)"
  else
    note FAIL "qa/docker-compose.yml is invalid"
    fail=1
  fi
else
  note FAIL "qa/docker-compose.yml missing"
  fail=1
fi

# All manual testing runs INSIDE the workspace container: it bakes the
# plugin (built by qa/Dockerfile itself) at /app, so the host needs NOTHING
# beyond docker. opencode, node, pnpm, and git are verified at runtime
# inside the workspace by qa-up.sh / qa-shell.sh.

if [ "$fail" -eq 0 ]; then
  echo
  echo "Host checks done. Start the isolated stack with qa/scripts/qa-up.sh"
  echo "and run all tests inside the workspace container (section 3)."
else
  echo
  echo "Fix the FAIL items above, then re-run this script."
fi

exit "$fail"
