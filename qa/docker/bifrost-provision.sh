#!/usr/bin/env bash
# Idempotently provisions the QA bifrost gateway through its management
# API. Runs INSIDE the workspace container (curl + python3 are present
# there); BIFROST_BASE_URL defaults to the compose-DNS gateway address.
#
# Two settings are seeded:
#   1. Client logging on (request traces: prompts, responses, tokens,
#      cost, latency) — the evidence source for groups A and J and the
#      "what requests hit the model" inspection the plan needs.
#   2. The `openrouter` provider key restricted to the model allowlist in
#      qa/bifrost/models.tsv, with the key value referenced as
#      `env.OPENROUTER_API_KEY` — the literal reference string only. The
#      API key itself never leaves the container's environment, so
#      nothing here can leak it (the POST body is safely printable).
#
# No config.json is checked in: everything is seeded via the API, so the
# repo holds no key-shaped data and the gateway's settings can be updated
# from the Web UI without touching the scripts.
#
# Idempotency: if the provider already exists (persisted in the
# bifrost-data volume), the seed is skipped. To apply a NEW models.tsv,
# reset the gateway data and re-provision:
#   docker volume rm opencode-sdd-qa_bifrost-data && qa/scripts/setup/qa-up.sh
set -euo pipefail

BIFROST_BASE_URL="${BIFROST_BASE_URL:-http://bifrost:8080}"
MODELS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../bifrost" && pwd)/models.tsv"
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

# --- 2. Provider: openrouter key limited to the QA allowlist. ---
# Build the request body with python3 (no shell quoting hazards). The body
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
            "provider": "openrouter",
            "keys": [
                {
                    "name": "qa-openrouter",
                    "value": "env.OPENROUTER_API_KEY",
                    "models": models,
                    "weight": 1.0,
                }
            ],
        }
    )
)
PY
)"

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
  echo "provider openrouter: already provisioned (escaped for changes:"
  echo "  docker volume rm opencode-sdd-qa_bifrost-data, then re-run qa-up.sh)"
else
  curl -fsS -X POST "$BIFROST_BASE_URL/api/providers" \
    -H 'Content-Type: application/json' \
    -d "$BODY" >/dev/null
  echo "provider openrouter: provisioned"
fi

echo "allowlist:"
awk -F'\t' 'NF >= 2 && $1 !~ /^#/ { printf "  - %s\n", $1 }' "$MODELS_FILE"
echo "== provisioning done =="
