#!/usr/bin/env bash
# Checks the prerequisites for the manual QA suite (qa/README.md).
# Exits non-zero when something essential is missing.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

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
    note PASS "qa/docker-compose.yml parses (gateway + workspace services)"
  else
    note FAIL "qa/docker-compose.yml is invalid"
    fail=1
  fi
else
  note FAIL "qa/docker-compose.yml missing"
  fail=1
fi

# The stack needs egress to https://openrouter.ai/api/v1 (the gateway
# forwards all inference there; the API host is `openrouter.ai`, NOT
# `api.openrouter.ai`). Check it once, without touching any key.
if docker run --rm busybox:1.36.1 \
  wget -qO- --spider https://openrouter.ai/api/v1/models >/dev/null 2>&1; then
  note PASS "OpenRouter reachable (https://openrouter.ai/api/v1)"
else
  note FAIL "OpenRouter NOT reachable - the QA stack needs outbound HTTPS"
  fail=1
fi

# All manual testing runs INSIDE the workspace container: it bakes the
# plugin (built by qa/Dockerfile itself) at /app, so the host needs NOTHING
# beyond docker. opencode, node, pnpm, and git are verified at runtime
# inside the workspace by qa-up.sh / qa-shell.sh.

if [ "$fail" -eq 0 ]; then
  echo
  echo "Host checks done. Start the isolated stack with qa/scripts/setup/qa-up.sh"
  echo "and run all tests inside the workspace container (section 3)."
  echo "The stack reads the OpenRouter key from the gitignored qa/.env"
  echo "(copy qa/.env.example) or prompts for it; the key is never"
  echo "committed — see qa/scripts/setup/lib-openrouter-key.sh."
else
  echo
  echo "Fix the FAIL items above, then re-run this script."
fi

exit "$fail"
