#!/usr/bin/env bash
# Smoke-tests the local LLM: model list, plain chat completion, and tool call.
# Set LLM_BASE_URL to the address opencode uses (default http://localhost:8080).
set -euo pipefail

BASE_URL="${LLM_BASE_URL:-http://localhost:8080}"
# Accept both "http://host:8080" and "http://host:8080/v1" forms; the
# compose stack sets the full form (http://llama-server:8080/v1).
case "$BASE_URL" in
  */v1) ;;
  *) BASE_URL="$BASE_URL/v1" ;;
esac

fail=0
pass() { printf 'PASS  %s\n' "$1"; }
failc() { printf 'FAIL  %s\n' "$1"; fail=1; }

if ! curl -fsS "$BASE_URL/models" >/dev/null 2>&1; then
  failc "GET $BASE_URL/models failed - is llm-up.sh run?"
  exit 1
fi
models="$(curl -fsS "$BASE_URL/models")"
# The served id is the fully-qualified HF repo id (e.g.
# bloomer010/Ling-3.0-tiny-GGUF:Q4_K_M); match case-insensitively.
if printf '%s' "$models" | grep -qi 'ling-3.0-tiny'; then
  pass "model list contains ling-3.0-tiny"
else
  failc "model list does not contain ling-3.0-tiny: $models"
fi

chat="$(curl -fsS "$BASE_URL/chat/completions" \
  -H 'Content-Type: application/json' \
  -d '{"model":"ling-3.0-tiny","messages":[{"role":"user","content":"Reply with the single word: ok"}]}')"
if printf '%s' "$chat" | python3 -c 'import json,sys; d=json.load(sys.stdin); c=d.get("choices",[{}])[0].get("message",{}).get("content") or ""; sys.exit(0 if c else 1)' 2>/dev/null; then
  pass "plain chat completion returns content"
else
  failc "plain chat returned no content: ${chat:0:200}"
fi

if [ "${LLM_SKIP_TOOLS:-}" = "1" ]; then
  echo "SKIP  tool-call check (LLM_SKIP_TOOLS=1)"
  exit "$fail"
fi

tools='{"model":"ling-3.0-tiny","messages":[{"role":"user","content":"What is the weather in Paris? Call get_weather."}],"tools":[{"type":"function","function":{"name":"get_weather","description":"Get the weather for a city","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}]}'
toolresp="$(curl -fsS "$BASE_URL/chat/completions" -H 'Content-Type: application/json' -d "$tools")"
if printf '%s' "$toolresp" | python3 -c 'import json,sys; d=json.load(sys.stdin); t=d.get("choices",[{}])[0].get("message",{}).get("tool_calls"); sys.exit(0 if t else 1)' 2>/dev/null; then
  pass "tool call returned (message.tool_calls present)"
else
  failc "tool-call check failed - the model answered with text (see TC-LLM-02); raw: ${toolresp:0:200}"
fi

# The scratch config registers alias model ids (deepseek-/qwen-/mimo-ling-
# 3.0-tiny) that all point at this one server, which only works because
# llama.cpp ignores the requested `model` and serves the loaded GGUF. Assert
# that here so a server which VALIDATES model ids fails loudly in group A
# instead of breaking the wizard and the TUI groups in confusing ways (the
# fix then is MODEL_ALIASES=0 in wire-opencode-config.sh).
aliasresp="$(curl -fsS "$BASE_URL/chat/completions" \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-ling-3.0-tiny","messages":[{"role":"user","content":"Reply with the single word: ok"}]}' 2>/dev/null || true)"
if printf '%s' "$aliasresp" | python3 -c 'import json,sys; d=json.load(sys.stdin); c=d.get("choices",[{}])[0].get("message",{}).get("content") or ""; sys.exit(0 if c else 1)' 2>/dev/null; then
  pass "alias model id is served (server ignores the requested model)"
else
  failc "alias model id rejected - set MODEL_ALIASES=0 when wiring; raw: ${aliasresp:0:200}"
fi

exit "$fail"
