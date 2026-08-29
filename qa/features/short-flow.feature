@short-flow
Feature: SDD short flow
  A single session: /sdd-spec, then /sdd-implement, then /sdd-validate on
  fixture F1 ("Add mul(a, b) to src/math.ts following TDD."). All
  artifacts live under /work/sdd-manual/.sdd/ (the qa-work volume);
  inspect them with `qa exec 'find /work/sdd-manual/.sdd -maxdepth 2'` or
  copy them out with `docker compose cp`.

  Model under test: the wired default (deepseek-v4-flash, cheap and
  strong). For a quality-comparison pass, re-wire with
  BIFROST_MODEL=anthropic/claude-sonnet-5, restart the session and
  repeat — the artifacts should be at least as complete, and the diff is
  the interesting part. Record the model in the run report's notes.

Background:
  Given the scratch project is at an initial commit
  And the LLM is up
  And the model under test is the wired default of opencode.json

@TC-SF-01 @P0
Scenario: Spec is created
  When I run /sdd-spec with $ARGUMENTS set to fixture F1
  And while the agent works, I note the questions it asks (template interview) and the tokens it spends (for group J)
  And I inspect .sdd/.current/spec.md
  Then the file exists and starts with '# Implementation Plan:'
  And sections ## Problem, ## Research Findings, ## File Structure, ## Solution, ## Tasks and ## Final Verification are present
  And tasks are formatted per the structure template: '### [ ] Task N: <name>' with a '**Verification**:' line each
  And the spec status is '**Status**: Draft'
  And the interview asked about edge cases and the answer landed in the spec (for example whether mul handles negative numbers)
  And the agent created no files outside .sdd/ and src/ and test/
  And I keep the copy of spec.md and the interview transcript in the evidence folder

@TC-SF-02 @P0
Scenario: Implementation follows TDD
  Given TC-SF-1 passed (spec with a mul task)
  When I run /sdd-implement
  And I watch the tool calls: expect a write for the test file, then a bash (pnpm test / vitest) showing failure, then a write for src/math.ts, then a passing bash
  And I inspect spec.md task markers and status
  Then the first test run FAILS (red) before the implementation, because the test file exists and mul does not
  And the test file is created (src/math.test.ts or test/math.test.ts) and src/math.ts gains mul
  And a later test run PASSES (green)
  And spec tasks are marked [x] and spec status is '**Status**: Implemented'
  And I keep the transcript showing red to green, the final src/math.ts and spec.md in the evidence folder

@TC-SF-03 @P0
Scenario: Validation completes and finalizes
  Given TC-SF-2 passed (spec Implemented, all tasks green)
  When I run /sdd-validate
  And I inspect .sdd/ after it finishes
  Then .sdd/.current/validation.md exists and contains '# Validation Report:', ## Summary, ## Task Status, ## Verification Checklist, ## Contract Status and ## Issues Found
  And the report's '**Overall Status**' is Complete with '## Issues Found' empty or resolved
  And spec.md status changed from Implemented to Validated
  And .sdd/.current was renamed to .sdd/<yyyymmdd>-<slug>/ (matching yyyyMMdd-... with a kebab name) and the renamed dir contains spec.md and validation.md
  And I keep the find .sdd -maxdepth 2 output and both artifacts in the evidence folder

@TC-SF-04 @P1
Scenario: Incomplete loop
  Given TC-SF-1 passed with a spec of TWO tasks, for example mul and negate
  When I implement only the first task (or let the agent do the same by deleting the second implementation)
  And I run /sdd-validate and read the report
  Then the first report has '**Overall Status**: Incomplete' and '## Issues Found' lists the missing task, and .sdd/.current still exists (not renamed)
  When I implement the second task and run /sdd-validate again
  Then the re-run reports Complete and renames .sdd/.current
  And I keep both reports and the find .sdd output before and after each run in the evidence folder

@TC-SF-05 @P1
Scenario: Missing spec error
  Given a fresh scratch project with no .sdd directory
  When I run /sdd-implement, then /sdd-validate
  Then the agent reports spec.md missing and directs to run /sdd-spec before doing anything else
  And no .sdd/ directory or other file is created
  And I keep the transcript excerpts in the evidence folder
