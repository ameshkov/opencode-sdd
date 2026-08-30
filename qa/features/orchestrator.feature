@orchestrator
Feature: prd-auto-implement orchestrator
  Model under test: the wired default (deepseek-v4-flash); the
  delegation chain (planner to coder to validator) also runs on each
  agent's recommended model, so a BIFROST_MODEL override (see
  qa/README.md) changes the whole chain. Record the model in the
  evidence notes.

@TC-ORCH-01 @P0
Scenario: Happy path, single issue
  Given .sdd/.current/prd.md plus one AFK issue exist (from TC-PF-1 and TC-PF-2), with no plan yet
  When I run /prd-auto-implement
  And I watch the delegation pattern in the transcript
  Then the run begins with the resume pre-check (re-reading prd.md and issues) and then delegates to sdd-planner via task
  And sdd-coder and sdd-validator are spawned afterwards; the orchestrator itself never uses sdd-command
  And counters ('**Plan attempt**', '**Validation attempt**') appear and stay within MAX_ATTEMPTS (default 3)
  And plan.md, code changes and issues/<ID>/validation.md exist at the end and a final summary is printed
  And I keep the transcript and the artifact tree in the evidence folder

@TC-ORCH-02 @P1
Scenario: Interruption and resume
  Given a run in progress (TC-ORCH-1 on fixture F2 — the long render of plan plus code gives time to interrupt)
  When I start /prd-auto-implement and interrupt it after plan.md exists but before completion (Ctrl-C in the TUI, Stop in the web UI)
  And I re-run /prd-auto-implement (the same command — resume is a pre-check)
  Then the re-run detects the existing plan.md and statuses instead of replanning from scratch (no second '**Plan attempt**' reset)
  And the planner's '# Implementation Plan:' is not regenerated (same file, same task [x] markers) and the run proceeds to coder
  And I keep the transcript of both runs and the plan.md mtime across runs in the evidence folder

@TC-ORCH-03 @P1
Scenario: HITL question pauses the run
  Given fixture F3's PRD plus its HITL issue exist, with no plan
  When I run /prd-auto-implement
  And when the question tool appears, I answer it (throw on zero)
  And I observe the resumed run
  Then the orchestration stops at the gate before planning, shows the question in the session, and resumes after the answer
  And the decision lands in the issue's issue.md under '## Human Decisions' as Resolved with the answer, and is not asked again
  And I keep the transcript and issue.md in the evidence folder

@TC-ORCH-04 @P2
Scenario: Missing prerequisites
  Given I reset the scratch baseline first: qa exec '/app/qa/docker/reset-scratch.sh /work/sdd-manual'
  When I run /prd-auto-implement (no PRD)
  Then it stops with the explicit error naming prd.md and the /prd-write command, and nothing else is created
  When I create a PRD by hand (copy from TC-PF-1) and run it again (no issues)
  Then it stops naming issues/ and /prd-to-issues
  And I keep the transcript excerpts and the find .sdd output in the evidence folder
