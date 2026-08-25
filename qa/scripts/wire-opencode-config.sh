#!/usr/bin/env bash
# Writes an opencode.json pointing at the local LLM into a project dir.
# Usage: qa/scripts/wire-opencode-config.sh <project-dir> [plugin-entry]
#   plugin-entry defaults to "opencode-sdd"; pass your local build path as
#   file:///path/to/opencode-sdd for dev runs.
# Env: LLM_BASE_URL (default http://localhost:8080/v1)
#      MODEL_ALIASES=0 omits the keyword-matching alias models (see below);
#      they are registered by default.
#
# The written config disables opencode's built-in `opencode` provider
# (`disabled_providers`), which is loaded automatically and would otherwise
# (a) route requests to a REMOTE gateway — breaking the "no remote LLM
# tokens" guarantee of this QA stack — and (b) pollute every model list
# (7 free-tier models ahead of the local one, so `local-llm/ling-3.0-tiny`
# falls below the CLI wizard's 7-item prompt fold and the wizard's
# `[recommended]` badges match gateway models instead of the local one).
#
# Besides the real model id, three aliases of the SAME served model are
# registered: llama.cpp ignores the `model` field of a request and answers
# with whatever GGUF is loaded (asserted by llm-smoke.sh; plain completions,
# tool calls and full opencode sessions all work through an alias id). Their
# ids carry the CLI wizard's recommendation keywords, which makes several
# behaviours observable that a single-model provider hides — the wizard's
# `[recommended]` badge and keyword-priority ordering (TC-CLI-02), and
# whether a per-agent `model` is really honoured at runtime (TC-REG-03,
# which needs an id DIFFERENT from the global default to prove anything):
#   deepseek-ling-3.0-tiny  strong tier, keyword 'deepseek' (priority 0)
#   qwen-ling-3.0-tiny      strong tier, keyword 'qwen'     (priority 1)
#   mimo-ling-3.0-tiny      cheap  tier, keyword 'mimo'     (priority 0)
# Set MODEL_ALIASES=0 only when the LLM server VALIDATES the requested
# model id (llama.cpp router mode, vLLM, ...), where alias ids would 404.
set -euo pipefail

PROJECT="${1:-}"
PLUGIN_ENTRY="${2:-opencode-sdd}"
BASE_URL="${LLM_BASE_URL:-http://localhost:8080/v1}"
MODEL_ALIASES="${MODEL_ALIASES:-1}"

if [ -z "$PROJECT" ] || [ ! -d "$PROJECT" ]; then
  echo "usage: wire-opencode-config.sh <project-dir> [plugin-entry]" >&2
  exit 1
fi

TARGET="$PROJECT/opencode.json"
if [ -e "$TARGET" ]; then
  echo "WARN: overwriting existing $TARGET"
fi

# The real model is listed first so it stays the input-order default; the
# aliases follow (unless MODEL_ALIASES=0).
MODELS='        "ling-3.0-tiny": { "name": "Ling 3.0 Tiny", "tool_call": true }'
if [ "$MODEL_ALIASES" != "0" ]; then
  MODELS="$MODELS,
        \"deepseek-ling-3.0-tiny\": { \"name\": \"DeepSeek alias of Ling 3.0 Tiny\", \"tool_call\": true },
        \"qwen-ling-3.0-tiny\": { \"name\": \"Qwen alias of Ling 3.0 Tiny\", \"tool_call\": true },
        \"mimo-ling-3.0-tiny\": { \"name\": \"MiMo alias of Ling 3.0 Tiny\", \"tool_call\": true }"
fi

cat > "$TARGET" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "local-llm": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "$BASE_URL" },
      "models": {
$MODELS
      }
    }
  },
  "model": "local-llm/ling-3.0-tiny",
  "disabled_providers": ["opencode"],
  "plugin": ["$PLUGIN_ENTRY"]
}
EOF

echo "Wrote $TARGET"
echo "plugin:   $PLUGIN_ENTRY"
echo "baseURL:  $BASE_URL"
echo "providers: local-llm only (built-in 'opencode' provider disabled)"
if [ "$MODEL_ALIASES" != "0" ]; then
  echo "models:   ling-3.0-tiny + 3 keyword aliases (same served model)"
else
  echo "models:   ling-3.0-tiny only (MODEL_ALIASES=0)"
fi
echo "Next: start opencode in $PROJECT"
