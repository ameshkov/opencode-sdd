@perf
Feature: Cost and performance
  These quantify what each flow step costs on the model under test.
  They inform model and prompt choices — and, since inference is billed
  to the OpenRouter key, the token guidance in qa/README.md.

  Everything reads from the gateway's request log (/api/logs, enabled
  automatically by bifrost-provision.sh), which records input/output
  tokens, cost, latency and status per request. All queries run from
  inside the workspace (compose DNS):
  `qa exec 'curl -fsS "http://bifrost:8080/api/logs?limit=50"'`

@TC-PERF-01 @P2
Scenario: Token and cost stats per step
  Given the gateway is up and request logging is enabled (default provisioning)
  When I note the start_time/end_time window (or add limit=), run TC-SF-1 and TC-PF-1, then query: `qa exec 'curl -fsS "http://bifrost:8080/api/logs?providers=openrouter&limit=50"'`
  Then every request row carries usage (prompt/completion tokens), cost and latency — a missing field means logging was not enabled at provision time (re-run qa-up.sh)
  And the largest prompt (for example the /prd-write step) fits well below the model's context length (deepseek-v4-flash and qwen3.5-plus: 1M; claude-sonnet-5: 1M; see models.tsv) — I record the worst case
  And I copy the /api/logs excerpt with per-request stats into the evidence folder for future regression

@TC-PERF-02 @P2
Scenario: Context fit
  Given TC-PF-1 and TC-PF-3 artifacts exist
  When I run /prd-write and /prd-issue-to-plan
  And I query: `qa exec 'curl -fsS "http://bifrost:8080/api/logs?status=error&limit=50"'`
  Then no context_length_exceeded or truncated-class error rows exist (OpenRouter rejects over-length prompts rather than truncating)
  And the inspected responses contain the full template headings (no cut-off text); if a model's context is smaller than the needed prompt, switch to a longer-context model (BIFROST_MODEL) and note the delta
  And I keep the log excerpts and the model under test in the evidence folder

@TC-PERF-03 @P2
Scenario: Thinking-mode trade-off
  Given TC-PF-3 is reproducible
  When I add a low-effort option to the model entry in /work/sdd-manual/opencode.json:
  And the model entry becomes `"openrouter/deepseek/deepseek-v4-flash": { "name": "DeepSeek V4 Flash", "tool_call": true, "options": { "reasoningEffort": "low" } }`
  And I reload the config in opencode, run /prd-issue-to-plan and note the time
  And I change reasoningEffort to high (or remove the option = model default), reload and repeat the run
  And I query /api/logs for both windows and compare total_tokens, total_cost and average_latency
  And I restore the default wiring (re-run wire-opencode-config.sh)
  Then reasoningEffort high costs measurably more tokens/time than low on the same model (record both)
  And the run with low still produces a valid '# Implementation Plan:' artifact (the default is deliberately cheap-and-sufficient)
  And I keep the per-run token/time/cost table and both plan artifacts in the evidence folder
