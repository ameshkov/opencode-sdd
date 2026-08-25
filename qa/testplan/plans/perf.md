# Group J — Cost and performance

These quantify what the tiny local model costs per flow step. They
inform context and quant choices in `qa/docker-compose.yml`.

## TC-PERF-01 — Token stats per step (P2)

- **Objective**: Record prompt/decoded tokens for each flow step.
- **Verification**: llama-server log parsing
  (`prompt eval` / `eval time` lines) or opencode's usage panel.
- **Preconditions**: LLM up with logging visible.
- **Steps**:
  1. Run TC-SF-01 and TC-PF-01, tailing
     `docker compose -f qa/docker-compose.yml logs -f llama-server`.
  2. Record prompt-eval tokens and decoded tokens per request.
- **Expected result**:
    - Assert every step's prompt fits well under 16K (e.g. PRD-write
      prompt < 12K) — otherwise raise `-c` (see TC-PERF-02).
    - Record the numbers in the evidence file for future regression.
- **Evidence**: server log excerpt with per-request token stats.

## TC-PERF-02 — Context fit (P2)

- **Objective**: Verify no truncation on the largest prompts.
- **Verification**: server warnings; review of inlined templates.
- **Preconditions**: TC-PF-01/03 artifacts.
- **Steps**:
  1. Run `/prd-write` and `/prd-issue-to-plan`.
  2. Grep the server log for truncated/context warnings.
- **Expected result**:
    - Assert no context-exceeded warning; if the prompt exceeds `-c`,
      increase it and re-run, noting the delta in the plan.
- **Evidence**: log excerpts; the `-c` value used.

## TC-PERF-03 — Thinking-mode trade-off (P2)

- **Objective**: Quantify time/token cost of reasoning mode on the
  planner step.
- **Verification**: server logs per run.
- **Preconditions**: TC-PF-03 reproducible.
- **Steps**:
  1. Run `/prd-issue-to-plan` with `--reasoning-effort low` (current
     compose default); record end-to-end time and tokens.
  2. Edit the compose command to drop the flag (template default =
     thinking on); `docker compose -f qa/docker-compose.yml up -d`;
     wait; repeat the run.
  3. Restore the low setting.
- **Expected result**:
    - Assert a measurable delta (thinking on = more decoded tokens, more
      wall time) so the default can be chosen deliberately; record both
      numbers.
- **Evidence**: per-run token/time table.
