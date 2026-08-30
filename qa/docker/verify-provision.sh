#!/usr/bin/env bash
# Verifies the provisioned QA gateway end to end. Runs INSIDE the
# workspace container (curl + python3 are present there);
# BIFROST_BASE_URL defaults to the compose-DNS gateway address.
#
# This is the post-provision gate qa-up.sh runs after
# bifrost-provision.sh: a provider that was created with ZERO keys (the
# failure mode that silently produced a "healthy" stack serving 0
# models) must fail here, and fail LOUDLY, instead of leaving a stack
# that cannot answer a single request. The check list is exactly the
# Group A "is the stack sane" surface, folded into stack bring-up:
#
#   1. The gateway answers /health.
#   2. The openrouter provider exists and is active.
#   3. At least one key exists, is enabled and authorizes >= 1 model.
#   4. /v1/models returns a non-empty list that contains the QA default.
#   5. One plain chat completion succeeds (the only check that costs
#      tokens — a handful at max_tokens=8).
#
# Exit 0 when every check passes; non-zero otherwise (with one FAIL
# line per broken check plus remediation hints) so callers can abort
# the stack bring-up instead of starting an unusable QA session.
set -euo pipefail

BIFROST_BASE_URL="${BIFROST_BASE_URL:-http://bifrost:8080}"
MODELS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../bifrost" && pwd)/models.tsv"

DEFAULT_MODEL="$(awk -F'\t' 'NF >= 2 && $1 !~ /^#/ { print $1; exit }' "$MODELS_FILE" || true)"
if [ -z "$DEFAULT_MODEL" ]; then
  echo "ERROR: no model allowlist entries in $MODELS_FILE" >&2
  exit 1
fi

fail=0
pass() { printf 'PASS  %s\n' "$1"; }
failc() { printf 'FAIL  %s\n' "$1"; fail=1; }

# --- 1. Health ---------------------------------------------------------
if curl -fsS "$BIFROST_BASE_URL/health" >/dev/null 2>&1; then
  pass "gateway health OK"
else
  failc "gateway /health does not answer ($BIFROST_BASE_URL) - is the bifrost container up?"
fi

# --- 2. Provider active ------------------------------------------------
providers="$(curl -fsS "$BIFROST_BASE_URL/api/providers" 2>/dev/null || true)"
if printf '%s' "$providers" | python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
for provider in data.get("providers", []):
    if provider.get("name") == "openrouter":
        raise SystemExit(0 if provider.get("provider_status") == "active" else 1)
raise SystemExit(1)
' 2>/dev/null; then
  pass "openrouter provider active"
else
  # Print the API body (truncated) — it is printable by contract: the
  # key value on this endpoint is a masked env reference, never the key.
  failc "openrouter provider missing or not active: ${providers:0:400}"
fi

# --- 3. Keys present and enabled --------------------------------------
keys="$(curl -fsS "$BIFROST_BASE_URL/api/providers/openrouter/keys" 2>/dev/null || true)"
if printf '%s' "$keys" | python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
for key in data.get("keys") or []:
    if key.get("name") == "qa-openrouter" \
            and key.get("enabled") \
            and key.get("models"):
        raise SystemExit(0)
raise SystemExit(1)
' 2>/dev/null; then
  pass "key qa-openrouter present, enabled, with models"
else
  failc "no usable qa-openrouter key (enabled + models) -> the gateway serves 0 models: ${keys:0:400}"
fi

# --- 4. /v1/models non-empty and contains the default ------------------
models="$(curl -fsS "$BIFROST_BASE_URL/v1/models" 2>/dev/null || true)"
if [ -n "$models" ] && printf '%s' "$models" | grep -qi "$DEFAULT_MODEL"; then
  pass "GET /v1/models contains $DEFAULT_MODEL"
else
  failc "GET /v1/models does not contain $DEFAULT_MODEL (provider/key state above tells you why): ${models:0:300}"
fi

# --- 5. One smoke completion (tiny) ------------------------------------
chat="$(curl -fsS "$BIFROST_BASE_URL/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"openrouter/$DEFAULT_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: ok\"}],\"max_tokens\":8}" 2>/dev/null || true)"
if printf '%s' "$chat" | python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
raise SystemExit(0 if content else 1)
' 2>/dev/null; then
  pass "smoke completion returns content"
else
  failc "smoke completion returned no content (key invalid, credit out, or OpenRouter error): ${chat:0:200}"
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "VERIFICATION FAILED - the gateway will not serve requests. Fix, then re-run qa/scripts/setup/qa-up.sh:"
  echo "  - keys cleared / provider inactive:  check qa/.env and run 'docker volume rm opencode-sdd-qa_bifrost-data'"
  echo "  - OpenRouter errors:                 docker compose -f qa/docker-compose.yml logs bifrost"
  exit 1
fi

echo
echo "verification OK: the gateway answers 1 request (Group A folded into stack bring-up)"
