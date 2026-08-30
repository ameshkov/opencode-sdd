#!/usr/bin/env bash
# Idempotently provisions the QA bifrost gateway through its management
# API. Runs INSIDE the workspace container (curl + python3 are present
# there); BIFROST_BASE_URL defaults to the compose-DNS gateway address.
#
# Three settings are seeded:
#   1. Client logging on (request traces: prompts, responses, tokens,
#      cost, latency) — the evidence source for groups A and J and the
#      "what requests hit the model" inspection the plan needs.
#   2. The `openrouter` provider itself (exists -> skip; the provider
#      carries no key data).
#   3. The provider key restricted to the model allowlist in
#      qa/bifrost/models.tsv, with the key value referenced as
#      `env.OPENROUTER_API_KEY` — the literal reference string only. The
#      API key itself never leaves the container's environment, so
#      nothing here can leak it (the request bodies are safely
#      printable).
#
# Keys live on their own endpoints since bifrost 1.6.x:
# `POST /api/providers/{provider}/keys` (create) and
# `PUT /api/providers/{provider}/keys/{key_id}` (update). POSTing a
# `keys` array inside `/api/providers` is silently ignored, so keys are
# NEVER seeded through the provider endpoint. Re-running the script
# reconciles the key's model allowlist with models.tsv — no volume
# reset needed when the allowlist changes.
#
# No config.json is checked in: everything is seeded via the API, so the
# repo holds no key-shaped data and the gateway's settings can be updated
# from the Web UI without touching the scripts.
set -euo pipefail

BIFROST_BASE_URL="${BIFROST_BASE_URL:-http://bifrost:8080}"
MODELS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../bifrost" && pwd)/models.tsv"
PROVIDER="openrouter"
KEY_NAME="qa-openrouter"

if [ ! -r "$MODELS_FILE" ]; then
  echo "ERROR: model allowlist not found: $MODELS_FILE" >&2
  exit 1
fi

echo "== provisioning bifrost at $BIFROST_BASE_URL =="

# --- 1. Client config: request logging on (tokens/cost/latency traces). ---
CLIENT_CONFIG='{"client_config":{"enable_logging":true,"drop_excess_requests":false,"log_retention_days":90}}'
curl -fsS -X PUT "$BIFROST_BASE_URL/api/config" \
  -H 'Content-Type: application/json' \
  -d "$CLIENT_CONFIG" >/dev/null
echo "client config: request logging enabled"

# --- 2. Provider: openrouter (no key data on this endpoint). ---
EXISTING="$(curl -fsS "$BIFROST_BASE_URL/api/providers" | python3 -c '
import json
import sys

data = json.load(sys.stdin)
for provider in data.get("providers", []):
    if provider.get("name") == "openrouter":
        print("yes")
        raise SystemExit(0)
print("no")
')"

if [ "$EXISTING" = "yes" ]; then
  echo "provider $PROVIDER: exists"
else
  curl -fsS -X POST "$BIFROST_BASE_URL/api/providers" \
    -H 'Content-Type: application/json' \
    -d "{\"provider\":\"$PROVIDER\"}" >/dev/null
  echo "provider $PROVIDER: created"
fi

# --- 3. Key: openrouter API key limited to the QA allowlist. ---
# Build the key body with python3 (no shell quoting hazards). The body
# contains `env.OPENROUTER_API_KEY` — a reference, NOT the key value.
BODY="$(python3 - "$MODELS_FILE" <<'PY'
import json
import sys

models = []
with open(sys.argv[1]) as fh:
    for line in fh:
        line = line.split("#")[0].strip()
        if not line:
            continue
        slug = line.split("\t")[0].strip()
        if slug:
            models.append(slug)

if not models:
    raise SystemExit("ERROR: no models parsed from the allowlist")

print(
    json.dumps(
        {
            "name": "qa-openrouter",
            "value": "env.OPENROUTER_API_KEY",
            "models": models,
            "weight": 1.0,
            "enabled": True,
        }
    )
)
PY
)"

KEY_STATE="$(curl -fsS "$BIFROST_BASE_URL/api/providers/$PROVIDER/keys" | python3 -c '
import json
import sys

data = json.load(sys.stdin)
for key in data.get("keys") or []:
    if key.get("name") == "qa-openrouter":
        print("existing:" + key["id"])
        raise SystemExit(0)
print("missing")
')"

case "$KEY_STATE" in
  missing)
    curl -fsS -X POST "$BIFROST_BASE_URL/api/providers/$PROVIDER/keys" \
      -H 'Content-Type: application/json' \
      -d "$BODY" >/dev/null
    echo "key $KEY_NAME: created"
    ;;
  existing:*)
    KEY_ID="${KEY_STATE#existing:}"
    # Reconcile the allowlist with models.tsv (PUT takes the full key
    # object; adding/removing models on re-runs needs no volume reset).
    curl -fsS -X PUT "$BIFROST_BASE_URL/api/providers/$PROVIDER/keys/$KEY_ID" \
      -H 'Content-Type: application/json' \
      -d "$BODY" >/dev/null
    echo "key $KEY_NAME: allowlist reconciled"
    ;;
esac

# --- 4. Warm the model catalog so /v1/models answers immediately. ---
# Best effort: the gateway refreshes from OpenRouter on demand anyway.
curl -fsS -X POST "$BIFROST_BASE_URL/api/providers/$PROVIDER/refresh-models" \
  -H 'Content-Type: application/json' -d '{}' >/dev/null 2>&1 \
  || echo "note: model catalog refresh skipped (non-fatal)"

echo "allowlist:"
awk -F'\t' 'NF >= 2 && $1 !~ /^#/ { printf "  - %s\n", $1 }' "$MODELS_FILE"
echo "== provisioning done =="
