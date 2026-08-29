#!/usr/bin/env bash
# Writes an opencode.json pointing at the bifrost/OpenRouter gateway into a
# project dir.
# Usage: qa/docker/wire-opencode-config.sh <project-dir> [plugin-entry]
#   plugin-entry defaults to "opencode-sdd"; pass your local build path as
#   file:///path/to/opencode-sdd for dev runs.
# Env: BIFROST_BASE_URL (default http://localhost:8080; the compose stack
#      sets http://bifrost:8080 — with or without a /v1 suffix)
#      BIFROST_MODEL   (OpenRouter slug used as the global default model;
#      defaults to the FIRST entry of qa/bifrost/models.tsv).
#      Override it per run-group to test how the prompts behave with
#      different frontier models, e.g.
#        BIFROST_MODEL=anthropic/claude-sonnet-5 qa exec \
#          '/app/qa/docker/wire-opencode-config.sh /work/sdd-manual file:///app'
#
# The written config registers ONE provider, `bifrost` (OpenAI-compatible
# endpoint of the gateway, `@ai-sdk/openai-compatible`), with exactly the
# models of the qa/bifrost/models.tsv allowlist. Each opencode model id is
# `openrouter/<slug>` — the form the gateway routes (bifrost strips its
# OWN provider prefix and passes the rest to OpenRouter). opencode sends
# the config model key verbatim to the API (proven by the e2e mock), so a
# model `openrouter/deepseek/deepseek-v4-flash` reaches OpenRouter typed
# `deepseek/deepseek-v4-flash`. The full config-level id is
# `bifrost/openrouter/<slug>`.
#
# `disabled_providers: ["opencode"]` turns off opencode's built-in
# free-tier provider, which is loaded automatically whenever no explicit
# provider list is set. Leaving it on (a) lets requests reach other remote
# models (the wizard's list would include them, and the Tab switcher would
# offer them) and (b) pollutes every model list with its 7 models, which
# pushes the QA models below the CLI wizard's 7-item prompt fold.
#
# Keyword coverage: the allowlist layout (deepseek + qwen for strong
# agents, mimo + gemini for cheap ones) is what makes the wizard's
# `[recommended]` badges and keyword-priority ordering observable — see
# qa/bifrost/models.tsv. Keep at least one model per keyword when editing.
set -euo pipefail

PROJECT="${1:-}"
PLUGIN_ENTRY="${2:-opencode-sdd}"
BASE_URL="${BIFROST_BASE_URL:-http://localhost:8080}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_FILE="$SCRIPT_DIR/../bifrost/models.tsv"

if [ -z "$PROJECT" ] || [ ! -d "$PROJECT" ]; then
  echo "usage: wire-opencode-config.sh <project-dir> [plugin-entry]" >&2
  exit 1
fi
if [ ! -r "$MODELS_FILE" ]; then
  echo "ERROR: model allowlist not found: $MODELS_FILE" >&2
  exit 1
fi

# Normalize: no trailing slash, no /v1 suffix (the config appends /v1).
BASE_URL="${BASE_URL%/}"
case "$BASE_URL" in
  */v1) BASE_URL="${BASE_URL%/v1}" ;;
esac

# The default model = first allowlist entry unless BIFROST_MODEL overrides.
DEFAULT_MODEL="${BIFROST_MODEL:-}"
if [ -z "$DEFAULT_MODEL" ]; then
  DEFAULT_MODEL="$(awk -F'\t' 'NF >= 2 && $1 !~ /^#/ { print $1; exit }' "$MODELS_FILE")"
fi

TARGET="$PROJECT/opencode.json"
if [ -e "$TARGET" ]; then
  echo "WARN: overwriting existing $TARGET"
fi

MODEL_COUNT="$(awk -F'\t' 'NF >= 2 && $1 !~ /^#/ { n++ } END { print n + 0 }' "$MODELS_FILE")"
if [ "$MODEL_COUNT" -eq 0 ]; then
  echo "ERROR: $MODELS_FILE has no model rows" >&2
  exit 1
fi

MODEL_SLUGS="$(awk -F'\t' 'NF >= 2 && $1 !~ /^#/ { printf "  - %s\n", $1 }' "$MODELS_FILE")"

# Build the `models` map: one entry per allowlist row, key
# `openrouter/<slug>` with a display `name` for the TUI + wizard.
MODELS_BODY="$(awk -F'\t' '
NF >= 2 && $1 !~ /^#/ {
  if (n) printf ",\n"
  n = 1
  printf "        \"openrouter/%s\": { \"name\": \"%s\", \"tool_call\": true }", $1, $2
}
END { printf "\n" }
' "$MODELS_FILE")"

cat > "$TARGET" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "bifrost": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "$BASE_URL/v1" },
      "models": {
$MODELS_BODY
      }
    }
  },
  "model": "bifrost/openrouter/$DEFAULT_MODEL",
  "disabled_providers": ["opencode"],
  "plugin": ["$PLUGIN_ENTRY"]
}
EOF

echo "Wrote $TARGET"
echo "plugin:    $PLUGIN_ENTRY"
echo "baseURL:   $BASE_URL/v1"
echo "provider:  bifrost only (built-in 'opencode' provider disabled)"
echo "default:   bifrost/openrouter/$DEFAULT_MODEL (override with BIFROST_MODEL=<slug>)"
echo "models ($MODEL_COUNT):"
printf '%s\n' "$MODEL_SLUGS"
echo "Next: start opencode in $PROJECT"
