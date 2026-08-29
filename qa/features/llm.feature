@llm
Feature: Gateway and model infrastructure
  Proves the environment itself; nothing else can pass if this fails.
  The gateway is bifrost (compose service), the provider is OpenRouter —
  these cases hit the network and cost real (tiny, on the cheap default
  model) tokens. Run this group once per stack start; everything after it
  is free of setup overhead. The stack, the key contract and the
  evidence convention are documented in qa/README.md.

  A full `docker compose down` (or `down -v`) REMOVES the bifrost
  container and its env, so the next `qa/scripts/setup/qa-up.sh` /
  `llm-up.sh` re-provisions from `qa/bifrost/models.tsv` (and prompts
  for the key when no `qa/.env` exists). That is by design
  (human-gated), not a regression. Restart-only flows (`llm-down.sh` /
  `llm-up.sh`) keep the container, its env and the `bifrost-data`
  volume.

Background:
  Given the stack was started with qa/scripts/setup/qa-up.sh and reported health OK
  And the OpenRouter provider is provisioned with the QA allowlist

@TC-LLM-01 @P0
Scenario: Gateway healthy, model reachable
  Given qa-up.sh printed a provisioning summary that lists the allowlist
  When I run the smoke script inside the workspace: `docker compose -f qa/docker-compose.yml exec qa bash -lc '/app/qa/docker/llm-smoke.sh'`
  Then docker compose -f qa/docker-compose.yml ps shows the gateway healthy and the workspace Up
  And /v1/models returns a non-empty list containing deepseek/deepseek-v4-flash
  And the smoke script prints PASS for the model-list and the plain-chat checks
  And the gateway log says successfully started bifrost with no provider-error lines for openrouter
  And I keep the smoke output, the docker compose ps line and an /api/logs?status=error excerpt in the run's evidence folder

@TC-LLM-02 @P0
Scenario: Tool calls are parsed
  Given the gateway is healthy and TC-LLM-1 passed
  When I run the smoke script with BIFROST_BASE_URL set explicitly: `BIFROST_BASE_URL=http://bifrost:8080 docker compose -f qa/docker-compose.yml exec qa bash -lc '/app/qa/docker/llm-smoke.sh'`
  Then the smoke script prints PASS for the tool-call check
  And the completion's choices[0].message.tool_calls is a non-empty array
  And its first entry has function.name equal to get_weather
  And its function.arguments is valid JSON containing city
  And I keep the raw response payload (printed by the script on failure) in the evidence folder

@TC-LLM-03 @P1
Scenario: Restart needs no key and keeps state
  Given at least one inference was made, so /api/logs has a row
  When I run qa/scripts/setup/llm-down.sh
  Then it stops the gateway and prints the kept-volume note
  When I run qa/scripts/setup/llm-up.sh with OPENROUTER_API_KEY unset and no TTY
  Then it reaches health OK within about 2 minutes without prompting or failing
  And I query `curl -fsS http://bifrost:8080/api/providers` from the workspace
  And GET /api/providers still lists openrouter with the qa-openrouter key
  And /api/logs still returns the step-one request row
  And I keep the script outputs, the providers API response and the logs API excerpt in the evidence folder
