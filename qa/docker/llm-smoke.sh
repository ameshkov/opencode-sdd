#!/usr/bin/env bash
# Smoke-tests the bifrost/OpenRouter gateway: model list, plain chat
# completion, and tool call.
#
# Set BIFROST_BASE_URL to the address opencode uses (default
# http://localhost:8080 — the compose stack sets
# http://bifrost:8080). Accepts both "http://host:8080" and
# "http://host:8080/v1" forms. The model used is the FIRST entry of
# qa/bifrost/models.tsv (the QA default, currently deepseek-v4-flash);
# it is sent to the gateway as openrouter/<slug>.
#
# These checks hit OpenRouter and cost real (tiny) tokens: run the
# full group A only once per stack start.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_FILE="$SCRIPT_DIR/../bifrost/models.tsv"

BASE_URL="${BIFROST_BASE_URL:-http://localhost:8080}"
# Accept both "http://host:8080" and "http://host:8080/v1" forms; append
# /v1 unless already present (the OpenAI-compatible API entrypoint).
case "$BASE_URL" in
  */v1) ;;
  *) BASE_URL="$BASE_URL/v1" ;;
esac

DEFAULT_MODEL="$(awk -F'\t' 'NF >= 2 && $1 !~ /^#/ { print $1; exit }' "$MODELS_FILE" || true)"
if [ -z "$DEFAULT_MODEL" ]; then
  echo "ERROR: no model allowlist entries in $MODELS_FILE" >&2
  exit 1
fi
MODEL="openrouter/$DEFAULT_MODEL"

fail=0
pass() { printf 'PASS  %s\n' "$1"; }
failc() { printf 'FAIL  %s\n' "$1"; fail=1; }

# --- 1. Model list -------------------------------------------------------
if ! curl -fsS "$BASE_URL/models" >/dev/null 2>&1; then
  failc "GET $BASE_URL/models failed - is the stack up (qa/scripts/setup/qa-up.sh)?"
  exit 1
fi
models="$(curl -fsS "$BASE_URL/models")"
# With a valid key the OpenRouter provider reports its catalog, which
# contains the allowlisted slug. With an invalid/missing key the list is
# empty (seen live) — fail loudly so group A stops here.
if printf '%s' "$models" | grep -qi "$DEFAULT_MODEL"; then
  pass "model list contains $DEFAULT_MODEL"
else
  failc "model list does not contain $DEFAULT_MODEL (check the OpenRouter key): $models"
fi

# --- 2. Plain chat -------------------------------------------------------
chat="$(curl -fsS "$BASE_URL/chat/completions" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: ok\"}]}" 2>/dev/null || true)"
if printf '%s' "$chat" | python3 -c 'import json,sys; d=json.load(sys.stdin); c=d.get("choices",[{}])[0].get("message",{}).get("content") or ""; sys.exit(0 if c else 1)' 2>/dev/null; then
  pass "plain chat completion returns content"
else
  failc "plain chat returned no content (check the OpenRouter key is valid and the provider active): ${chat:0:200}"
fi

# --- 3. Tool call ---------------------------------------------------------
if [ "${LLM_SKIP_TOOLS:-}" = "1" ]; then
  echo "SKIP  tool-call check (LLM_SKIP_TOOLS=1)"
  exit "$fail"
fi

tools='{"model":"'"$MODEL"'","messages":[{"role":"user","content":"What is the weather in Paris? Call get_weather."}],"tools":[{"type":"function","function":{"name":"get_weather","description":"Get the weather for a city","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}]}'
toolresp="$(curl -fsS "$BASE_URL/chat/completions" -H 'Content-Type: application/json' -d "$tools" 2>/dev/null || true)"
if printf '%s' "$toolresp" | python3 -c 'import json,sys; d=json.load(sys.stdin); t=d.get("choices",[{}])[0].get("message",{}).get("tool_calls"); sys.exit(0 if t else 1)' 2>/dev/null; then
  pass "tool call returned (message.tool_calls present)"
else
  failc "tool-call check failed - the model answered with text (see TC-LLM-02); raw: ${toolresp:0:200}"
fi

exit "$fail"
