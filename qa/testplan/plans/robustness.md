# Group I — Robustness and degradation

## TC-ROB-01 — Missing asset directories (P1)

- **Objective**: Verify the config hook degrades gracefully when the
  commands/agents directories are missing — opencode must still start.
- **Verification**: log markers and host behavior.
- **Preconditions**: stack up (workspace container is built).
- **Steps**:
  1. Start opencode with the asset dirs pointing nowhere:
     `qa exec 'SDD_COMMANDS_DIR=/nonexistent SDD_TEMPLATES_DIR=/nonexistent
     SDD_AGENTS_DIR=/nonexistent opencode --print-logs'`.
- **Expected result**:
    - Assert opencode starts (no bootstrap failure, no red banner).
    - Assert the log contains `commands path is not a directory` (loader
      warning) and `failed to register SDD commands` — and the error is
      logged, not thrown.
- **Evidence**: opencode log (copied out of the container); screenshot of
  a working TUI.

## TC-ROB-02 — Wizard output loads in opencode (P2)

- **Objective**: Verify the config produced by TC-CLI-02/03 is accepted
  by opencode.
- **Preconditions**: config patched by the wizard; no manual edits.
- **Steps**:
  1. Start opencode: `qa exec 'opencode'`.
- **Expected result**:
    - Assert opencode starts cleanly, the local provider and model are
      available, and `/prd-write` runs.
- **Evidence**: log; first command run.

## TC-ROB-03 — Command with no arguments (P2)

- **Objective**: Verify commands handle an empty `$ARGUMENTS`.
- **Preconditions**: LLM up.
- **Steps**:
  1. Run `/sdd-spec` (no input), then `/prd-write` (no input).
- **Expected result**:
    - Assert neither command crashes; the agent either asks for the missing
      description or proceeds with generic instructions.
- **Evidence**: transcripts.

## TC-ROB-04 — Deterministic reload (P2)

- **Objective**: Verify a second opencode start produces identical
  registration state (no accumulation).
- **Preconditions**: TC-REG-01 done once.
- **Steps**:
  1. Restart opencode; repeat TC-REG-01's command/agent inspection.
- **Expected result**:
    - Assert counts are identical (16/7), and the log does not show extra
      registrations or double-counted entries.
- **Evidence**: both logs side by side.

## TC-ROB-05 — LLM server down (P1)

- **Objective**: Verify opencode and the plugin survive the LLM being
  unavailable and recover when it returns.
- **Verification**: session behavior; error surfaced for the provider.
- **Preconditions**: LLM was up; a session with the plugin loaded.
- **Steps**:
  1. `qa/scripts/llm-down.sh`.
  2. Ask the agent a simple question.
  3. `qa/scripts/llm-up.sh`; ask again.
- **Expected result**:
    - Assert the failure surfaces as a provider/network error from
      `local-llm` — the session stays alive, opencode does not crash.
    - Assert after restart the model responses work again in the same
      session (or one opencode restart as documented behavior).
- **Evidence**: transcript; server log.
