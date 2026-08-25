# Group G — `prd-auto-implement` orchestrator

## TC-ORCH-01 — Happy path, single issue (P0)

- **Objective**: Verify the orchestrator delegates all stages to the
  workers (planner → coder → validator) with no stage run by itself.
- **Verification**: transcript delegation order; final artifacts;
  loop counters.
- **Preconditions**: `.sdd/.current/prd.md` + one AFK issue (from
  TC-PF-01/02), no plan yet.
- **Steps**:
  1. Run `/prd-auto-implement`.
  2. Watch the delegation pattern in the transcript.
- **Expected result**:
    - Assert the run begins with the resume pre-check (re-reading
      `prd.md`/issues) then delegates to `sdd-planner` via `task`.
    - Assert `sdd-coder` and `sdd-validator` are spawned afterwards; the
      orchestrator itself never uses `sdd-command`.
    - Assert counters (`**Plan attempt**`, `**Validation attempt**`) appear
      and stay within `MAX_ATTEMPTS` (default 3).
    - Assert `plan.md`, code changes, and `issues/<ID>/validation.md` exist
      at the end and a final summary is printed.
- **Evidence**: transcript; artifact tree.

## TC-ORCH-02 — Interruption and resume (P1)

- **Objective**: Verify re-running `/prd-auto-implement` after an
  interruption resumes without redoing finished stages.
- **Verification**: transcript markers and task markers.
- **Preconditions**: a run in progress (TC-ORCH-01 on F2 — the long
  render of plan + code gives time to interrupt).
- **Steps**:
  1. Start `/prd-auto-implement`; Ctrl-C after `plan.md` exists but
     before completion.
  2. Re-run `/prd-auto-implement` (the same command — resume is a
     pre-check).
- **Expected result**:
    - Assert the re-run detects the existing `plan.md`/statuses instead of
      replanning from scratch (no second `**Plan attempt**` reset).
    - Assert the planner's `# Implementation Plan:` is not regenerated
      (same file, same task `[x]` markers) and the run proceeds to coder.
- **Evidence**: transcript of both runs; `plan.md` mtime across runs.

## TC-ORCH-03 — HITL question pauses the run (P1)

- **Objective**: Verify the orchestrator pauses at a HITL gate and
  continues with the recorded decision.
- **Verification**: question-tool interaction and `## Human Decisions`.
- **Preconditions**: F3 PRD + its HITL issue; no plan.
- **Steps**:
  1. Run `/prd-auto-implement`.
  2. When the `question` tool appears, answer it (throw on zero).
  3. Observe the resumed run.
- **Expected result**:
    - Assert the orchestration stops at the gate before planning, shows the
      question in the TUI, and resumes after the answer.
    - Assert the decision lands in the issue's `issue.md` under
      `## Human Decisions` as Resolved with the answer and is not asked
      again.
- **Evidence**: transcript; issue.md.

## TC-ORCH-04 — Missing prerequisites (P2)

- **Objective**: Verify the STOP contract when `prd.md` or issues are
  missing.
- **Verification**: transcript behavior, absence of side effects.
- **Preconditions**: fresh scratch project.
- **Steps**:
  1. Run `/prd-auto-implement` (no PRD).
  2. Create a PRD by hand (copy from TC-PF-01) and run it again (no
     issues).
- **Expected result**:
    - Assert the first run stops with the explicit error naming `prd.md`
      and the `/prd-write` command; nothing else is created.
    - Assert the second run stops naming `issues/` and `/prd-to-issues`.
- **Evidence**: transcript excerpts; `find .sdd`.
