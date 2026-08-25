# Group A — Local LLM infrastructure

Proves the environment itself; nothing else can pass if this fails.

## TC-LLM-01 — Server starts and serves the model (P0)

- **Objective**: Verify the compose stack is up, the model is installed
  and served, and the opencode-compatible endpoint responds.
- **Verification**: HTTP calls against `/v1/models` and
  `/v1/chat/completions`; server log inspection.
- **Preconditions**: `qa/scripts/qa-up.sh` up; LLM healthy.
- **Steps**:
  1. `qa/scripts/qa-up.sh`; wait for `health OK`.
  2. Host-side smoke (or inside the workspace, which uses compose DNS):
     `docker compose -f qa/docker-compose.yml exec qa bash -lc
     '/app/qa/scripts/llm-smoke.sh'`
  3. Host-side alternative: `qa/scripts/llm-smoke.sh`.
- **Expected result**:
    - Assert `/v1/models` lists a model whose id is `ling-3.0-tiny`.
    - Assert the smoke script prints PASS for the model-list and the plain
      chat check.
    - Assert the server log contains no `unknown model architecture` error.
    - Assert the container is healthy: `docker compose -f qa/docker-compose.yml
      ps` shows `healthy`.
- **Evidence**: `llm-smoke.sh` output; the `docker compose ps` line.

## TC-LLM-02 — Tool calls are parsed (P0)

- **Objective**: Verify llama.cpp returns `tool_calls` (not raw text) for
  a function-calling request — the capability every SDD worker needs to
  call `read`/`edit`/`bash`/`sdd-command`.
- **Verification**: JSON inspection of a chat completion with `tools`.
- **Preconditions**: TC-LLM-01 passed.
- **Steps**:
  1. `LLM_BASE_URL=http://localhost:8080 qa/scripts/llm-smoke.sh`
  2. If the tool-call check failed, inspect the raw response the script
     printed and the server log.
- **Expected result**:
    - Assert the smoke script prints PASS for the tool-call check.
    - Assert the completion's `choices[0].message.tool_calls` is a non-empty
      array whose first entry has `function.name` = `get_weather`.
    - Assert its `function.arguments` is valid JSON containing `city`.
- **Evidence**: raw response payload (script prints it on failure).

## TC-LLM-03 — Model cache survives restart (P1)

- **Objective**: Verify the 4.8 GB model is not re-downloaded on every
  start and the server restarts quickly.
- **Verification**: Timestamps and byte counts in the server log plus
  container start time.
- **Preconditions**: TC-LLM-01 passed (download completed once).
- **Steps**:
  1. `qa/scripts/llm-down.sh`
  2. `qa/scripts/llm-up.sh`; note the time-to-healthy.
  3. `docker compose -f qa/docker-compose.yml logs llama-server | grep -i
     download`
- **Expected result**:
    - Assert the second start reaches healthy in under ~2 minutes (no
      4.8 GB transfer).
    - Assert the log shows the model loading from the cache path, with no
      `downloading` progress lines.
- **Evidence**: `llm-up.sh` output; container log excerpt.
