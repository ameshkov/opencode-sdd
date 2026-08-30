#!/usr/bin/env bash
# Starts the full QA stack: the bifrost/OpenRouter gateway + the isolated
# workspace container. Waits until the gateway is healthy, provisions it
# (provider + logging), VERIFIES the provisioning end to end (provider,
# keys, model list, one smoke call) and only then prints how to enter.
# Refuses to start on a stale workspace image (SRC_HASH label mismatch).
#
# The OpenRouter API key is resolved by lib-openrouter-key.sh: gitignored
# qa/.env -> exported env var -> external key file -> interactive hidden
# prompt. It is never committed and never echoed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"
WORKSPACE_IMAGE="opencode-sdd-qa:workspace"

# shellcheck source=lib-openrouter-key.sh
source "$REPO_ROOT/qa/scripts/setup/lib-openrouter-key.sh"

# Optional host publishing (host-side smoke tests, the bifrost Web UI,
# and the opencode web UI for browser-driven runs):
#   QA_HOST_PORT=8080 qa/scripts/setup/qa-up.sh
# includes the ports override and publishes that host port; the web UI
# port is QA_WEB_PORT (default 4097, container 4096) and is published by
# the same override. Without them the stack is hermetic — no host port is
# bound, so nothing can collide with the host.
COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [ -n "${QA_HOST_PORT:-}" ] || [ -n "${QA_WEB_PORT:-}" ]; then
  COMPOSE_ARGS+=(-f "$REPO_ROOT/qa/docker-compose.ports.yml")
  if [ -n "${QA_HOST_PORT:-}" ]; then
    BIFROST_PORT="$QA_HOST_PORT"
    export BIFROST_PORT
  fi
fi

# --- Stale-image guard -------------------------------------------------
# The workspace image bakes the whole repo (plugin + build/ + qa/docker/
# payload scripts). Starting a stack on an image built from an older
# checkout silently loses everything the suite needs (the qa/docker/
# payload scripts, qa/scripts/, qa/features/, the plugin build). The
# Dockerfile bakes SRC_HASH (repo HEAD + working-tree diff) as a
# LABEL; mismatch => refuse with the exact rebuild command.
image_hash() {
  docker image inspect "$WORKSPACE_IMAGE" \
    --format '{{ index .Config.Labels "org.opencode-sdd.qa.src-hash" }}' \
    2>/dev/null || true
}

repo_hash() {
  local head diff_hash untracked
  head="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || echo no-git)"
  diff_hash="$(git -C "$REPO_ROOT" diff --binary 2>/dev/null | shasum -a 256 | cut -d' ' -f1 || echo no-diff)"
  # Untracked files (new qa payload scripts) also change the baked image,
  # so fold the porcelain status in — not just the tracked diff.
  untracked="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | shasum -a 256 | cut -d' ' -f1 || echo no-status)"
  printf '%s:%s:%s' "$head" "$diff_hash" "$untracked"
}

build_workspace_image() {
  echo "Building the workspace image (compiles build/ + bakes qa/ payload)..."
  docker compose "${COMPOSE_ARGS[@]}" build \
    --build-arg "SRC_HASH=$REPO_HASH" qa
  # compose adds the same value via its build args on plain `up -d`;
  # export it so a compose-driven rebuild (up --build) is not stale.
  export QA_SRC_HASH="$REPO_HASH"
}

REPO_HASH="$(repo_hash)"
IMAGE_HASH="$(image_hash)"
if [ -n "$IMAGE_HASH" ] && [ "$IMAGE_HASH" != "$REPO_HASH" ]; then
  echo "ERROR: the workspace image is STALE (built from $IMAGE_HASH, repo is $REPO_HASH)." >&2
  echo "       The image bakes the repo; a stale image loses qa/docker/ payloads and" >&2
  echo "       the plugin build. Rebuild:" >&2
  echo "         qa/scripts/setup/qa-up.sh   (builds it for you)" >&2
  echo "       or export QA_ALLOW_STALE_IMAGE=1 to start anyway (not recommended)." >&2
  if [ "${QA_ALLOW_STALE_IMAGE:-}" != "1" ]; then
    exit 1
  fi
  echo "WARN: QA_ALLOW_STALE_IMAGE=1 - starting against the stale image anyway."
elif [ -z "$IMAGE_HASH" ]; then
  echo "Workspace image is missing or has no source label - building."
  build_workspace_image
fi

PORT="${BIFROST_PORT:-8080}"

# On a macOS sandbox VM the published port is reachable via the NAT gateway
# (not localhost); fall back to it when localhost does not answer.
GATEWAY="$(route -n get default 2>/dev/null | awk '/gateway:/{print $2}')"
HEALTH_URL="http://localhost:$PORT/health"
HEALTH_URL_ALT="${GATEWAY:+http://$GATEWAY:$PORT/health}"

health_ok() {
  # Authoritative probe: via the workspace container's curl (no host port
  # published by default; the compose network does the routing). The qa
  # container itself waits for /health before finishing its boot.
  docker compose "${COMPOSE_ARGS[@]}" exec -T qa \
    curl -fsS http://bifrost:8080/health >/dev/null 2>&1 && return 0
  # Host-side probes for the opt-in ports override: localhost first, then
  # the NAT gateway on a macOS sandbox VM.
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1 \
    || { [ -n "$HEALTH_URL_ALT" ] && curl -fsS "$HEALTH_URL_ALT" >/dev/null 2>&1; }
}

# Human-gated: refuses to start without a key in non-interactive contexts.
resolve_openrouter_key

docker compose "${COMPOSE_ARGS[@]}" up -d

echo "Waiting for bifrost health (first start pulls the 315 MB image)..."
for i in $(seq 1 60); do
  if health_ok; then
    echo "health OK after $((i * 5))s"
    break
  fi
  sleep 5
  if [ "$i" -eq 60 ]; then
    echo "ERROR: gateway did not become healthy. Check logs:"
    echo "  docker compose -f $COMPOSE_FILE logs -f bifrost"
    exit 1
  fi
done

# Seed the gateway: OpenRouter provider (allowlist) + request logging.
# Idempotent; the provider settings persist in the bifrost-data volume.
echo "Provisioning the gateway..."
if docker compose "${COMPOSE_ARGS[@]}" exec -T qa \
  bash -lc '/app/qa/docker/bifrost-provision.sh'; then
  :
else
  echo "WARN: provisioning failed - the gateway was not configured."
  echo "      Continuing to verification; it will fail loudly below."
fi

# Post-provision verification (Group A folded into stack bring-up). A
# provider created with ZERO keys leaves a "healthy" stack that serves 0
# models — nothing downstream works, so fail loudly here instead of
# starting an unusable session.
echo "Verifying the provisioned gateway (provider, keys, model list, smoke call)..."
if docker compose "${COMPOSE_ARGS[@]}" exec -T qa \
  bash -lc '/app/qa/docker/verify-provision.sh'; then
  :
else
  echo "ERROR: post-provision verification FAILED - the gateway cannot answer a request." >&2
  echo "       Fix the cause and re-run qa/scripts/setup/qa-up.sh." >&2
  exit 1
fi

# Detect opt-in host publishing (qa/docker-compose.ports.yml) so the
# summary only lists host-side URLs when a port is actually bound.
# (`docker compose port` mis-reports an unbound expose as "invalid IP:0",
# so query the raw docker port of the container instead.)
BIFROST_ID="$(docker compose "${COMPOSE_ARGS[@]}" ps -q bifrost 2>/dev/null || true)"
PUBLISHED="$(docker port "${BIFROST_ID:+$BIFROST_ID}" 8080 2>/dev/null || true)"
QA_ID="$(docker compose "${COMPOSE_ARGS[@]}" ps -q qa 2>/dev/null || true)"
WEB_PUBLISHED="$(docker port "${QA_ID:+$QA_ID}" 4096 2>/dev/null || true)"

echo
echo "QA stack is ready."
echo "  workspace shell:  docker compose -f $COMPOSE_FILE exec -it qa bash"
echo "  opencode session: qa/docker/serve-web.sh + browser (qa/README.md 3.6)"
echo "  gateway (in workspace): http://bifrost:8080/v1 (compose DNS)"
if [ -n "${PUBLISHED:-}" ]; then
  echo "  gateway (from host):   http://localhost:$PORT"
  [ -n "${GATEWAY:-}" ] && echo "  gateway (sandbox VM):  http://$GATEWAY:$PORT"
  echo "  bifrost UI (logs):     http://localhost:$PORT/logs"
else
  echo "  gateway (host): no port published; add qa/docker-compose.ports.yml"
  echo "                for host-side access to the bifrost UI / smoke tests"
fi
if [ -n "${WEB_PUBLISHED:-}" ]; then
  WEB_PORT="${WEB_PUBLISHED##*:}"
  echo "  opencode web UI:       http://localhost:$WEB_PORT (serve-web.sh)"
  [ -n "${GATEWAY:-}" ] && echo "  opencode web UI (VM):  http://$GATEWAY:$WEB_PORT"
else
  echo "  opencode web UI: no port published; start qa/docker/serve-web.sh and"
  echo "                add qa/docker-compose.ports.yml for browser-driven runs"
fi
echo
echo "  First-time setup inside the workspace:"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/docker/scratch-init.sh /work/sdd-manual'"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/docker/wire-opencode-config.sh /work/sdd-manual file:///app'"
echo
echo "  Baseline reset between cases (wipes .sdd, resets git, rewires the config):"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/docker/reset-scratch.sh /work/sdd-manual'"
echo
echo "  Smoke test the gateway:"
echo "    docker compose -f $COMPOSE_FILE exec qa \\"
echo "      bash -lc '/app/qa/docker/llm-smoke.sh'"
