# Group E — SDD short flow

A single session: `/sdd-spec` → `/sdd-implement` → `/sdd-validate` on
fixture F1. All artifacts live under `/work/sdd-manual/.sdd/` (the
`qa-work` volume); inspect them from the host with
`docker compose -f qa/docker-compose.yml exec qa bash -lc 'find
/work/sdd-manual/.sdd -maxdepth 2'` or copy them out with
`docker compose cp`.

## TC-SF-01 — Spec is created (P0)

- **Objective**: Verify `/sdd-spec` produces `.sdd/.current/spec.md`
  following the plan template, with a task list in the task-structure
  template.
- **Verification**: file assertions on the artifact.
- **Preconditions**: scratch project at an initial commit; LLM up.
- **Steps**:
  1. Run `/sdd-spec` with `$ARGUMENTS` = fixture F1.
  2. While the agent works, note the questions it asks (template
     interview) and the tokens it spends (for group J).
  3. Inspect `.sdd/.current/spec.md`.
- **Expected result**:
    - Assert the file exists and starts with `# Implementation Plan:`.
    - Assert sections `## Problem`, `## Research Findings`,
      `## File Structure`, `## Solution`, `## Tasks`,
      `## Final Verification` are present.
    - Assert tasks are formatted per the structure template:
      `### [ ] Task N: <name>` with a `**Verification**:` line each.
    - Assert the spec status is `**Status**: Draft`.
    - Assert the interview asked about edge cases and the answer landed in
      the spec (e.g. "should mul handle negative numbers").
    - Assert the agent created no files outside `.sdd/` and `src/`, `test/`.
- **Evidence**: copy of `spec.md`; transcript of the interview.

## TC-SF-02 — Implementation follows TDD (P0)

- **Objective**: Verify `/sdd-implement` drives a failing test first
  (red), then the implementation (green), per spec task.
- **Verification**: file creation order in the transcript; test run
  results; final artifact states.
- **Preconditions**: TC-SF-01 (spec with a `mul` task).
- **Steps**:
  1. Run `/sdd-implement`.
  2. Watch the tool calls: expect a `write` for the test file, then a
     `bash` (`pnpm test` / `vitest`) showing failure, then a `write` for
     `src/math.ts`, then a passing `bash`.
  3. Inspect `spec.md` task markers and status.
- **Expected result**:
    - Assert the first test run FAILS (red) before the implementation,
      because the test file exists and `mul` does not.
    - Assert the test file is created (e.g. `src/math.test.ts` or
      `test/math.test.ts`) and `src/math.ts` gains `mul`.
    - Assert a later test run PASSES (green).
    - Assert spec tasks are marked `[x]` and spec status is
      `**Status**: Implemented`.
- **Evidence**: transcript showing red→green; final `src/math.ts`;
  `spec.md`.

## TC-SF-03 — Validation completes and finalizes (P0)

- **Objective**: Verify `/sdd-validate` writes the validation report and,
  on Complete, renames `.sdd/.current` to a dated slug.
- **Verification**: file assertions and directory state.
- **Preconditions**: TC-SF-02 (spec Implemented, all tasks green).
- **Steps**:
  1. Run `/sdd-validate`.
  2. Inspect `.sdd/` after it finishes.
- **Expected result**:
    - Assert `.sdd/.current/validation.md` exists and contains
      `# Validation Report:`, `## Summary`, `## Task Status`,
      `## Verification Checklist`, `## Contract Status`, `## Issues Found`.
    - Assert the report's `**Overall Status**` is `Complete` with note
      `## Issues Found` empty or resolved.
    - Assert `spec.md` status changed from `Implemented` to `Validated`.
    - Assert `.sdd/.current` was renamed to `.sdd/<yyyymmdd>-<slug>/`
      (matching `yyyyMMdd-...` with a kebab name) and the renamed dir
      contains `spec.md` and `validation.md`.
- **Evidence**: `find .sdd -maxdepth 2` output; both artifacts.

## TC-SF-04 — Incomplete loop (P1)

- **Objective**: Verify Incomplete does not finalize, and a fix re-runs
  to Complete.
- **Verification**: status assertions plus the rename event.
- **Preconditions**: TC-SF-01 (spec with TWO tasks, e.g. `mul` and
  `negate`).
- **Steps**:
  1. Implement only the first task (or let the agent do the same by
     deleting the second implementation).
  2. Run `/sdd-validate`; read the report.
  3. Implement the second task; run `/sdd-validate` again.
- **Expected result**:
    - Assert the first report has `**Overall Status**: Incomplete` and
      `## Issues Found` lists the missing task; `.sdd/.current` still exists
      (not renamed).
    - Assert re-running validation after the fix reports Complete and
      renames `.current`.
- **Evidence**: both reports; `find .sdd` before/after each run.

## TC-SF-05 — Missing spec error (P1)

- **Objective**: Verify `/sdd-implement` and `/sdd-validate` stop with
  clear guidance when no spec exists.
- **Verification**: transcript behavior; no side effects.
- **Preconditions**: fresh scratch project (no `.sdd`).
- **Steps**:
  1. Run `/sdd-implement`, then `/sdd-validate`.
- **Expected result**:
    - Assert the agent reports `spec.md` missing and directs to run
      `/sdd-spec` before doing anything else.
    - Assert no `.sdd/` directory or other file is created.
- **Evidence**: transcript excerpts.
