---
description: Orchestrate full PRD implementation end-to-end (provided by opencode-sdd)
agent: sdd-build
---
# Orchestrate full PRD implementation

Drive the entire post-specification pipeline.
For every issue in the PRD, delegate to the SDD stage workers (planner,
reviewer, coder, validator) in order, re-reading spec files before each
decision. You are the SDD orchestrator: you do NONE of the stage work yourself —
every plan, review, implementation, and validation is delegated to the matching
SDD subagent via the “task” tool.
Any edit you attempt is gated by your `ask` permission as a backstop; rely on
delegation instead.

## Input

User input: $ARGUMENTS

Extract the following from the user input:

- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored.
- **MAX_ATTEMPTS** (optional, default: `3`): The uniform cap for every capped
  loop (review, validation, and cross-cutting).

## Prerequisites

Check for the existence of the following IN THIS ORDER. On any hard-stop, do not
delegate to any subagent and do not write any file.

1. `{SPECS_DIR}/prd.md` — the parent PRD. If it is missing, STOP immediately
   with this error and delegate nothing:

   **ERROR: PRD not found at `{SPECS_DIR}/prd.md`. Run `/prd-write` first to
   create a PRD.**

2. `{SPECS_DIR}/issues/` — the issues directory.
   If it does not exist or contains no issue directories, STOP immediately with
   this error and delegate nothing:

   **ERROR: No issues found in `{SPECS_DIR}/issues/`. Run `/prd-to-issues` first
   to create issues from the PRD.**

The PRD-missing check is surfaced first (it is the first prerequisite checked).
A missing issues directory is only checked once the PRD exists.

## Steps

### Phase 1: Load the issue list

1. Read `{SPECS_DIR}/prd.md` for feature context.
2. Scan `{SPECS_DIR}/issues/` for issue directories.
   Sort them by numeric `ISSUE_ID` order — the leading number before the first
   `-` (so `1-AFK` before `2-AFK` before `10-AFK`). Process them in that order.

### Phase 2: Process each issue

For each issue `{ISSUE_ID}` in numeric order, run the staged delegation.
Before deciding each next step, RE-READ the relevant spec files (`issue.md`,
`plan.md`, `review.md`, `validation.md` as appropriate for that stage) — never
decide on stale state.

0. **Resume pre-check** — Before entering the staged delegation, re-read
   `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md` and (if it exists) `plan.md` to
   determine where to (re)enter, based on the issue’s current `**Status**`. A
   re-invocation of `/prd-auto-implement` after an interruption (crash, manual stop,
   or escalation) must pick up where it left off without redoing completed work:

    - **`Validated`** — the issue is fully complete.
      **Skip** it entirely (do not re-plan, re-review, re-implement, or
      re-validate) and proceed to the next issue.
    - **`Implemented`** — implementation finished, awaiting validation.
      Skip steps 1–3 and enter at step 4 (Validation loop).
    - **`In Progress`** — implementation was interrupted mid-way (the plan is
      already approved). Skip steps 1–2 and enter at step 3 (Implement).
      The delegated `sdd-coder` resumes from the plan’s `[x]` task markers rather
      than redoing completed tasks.
    - **`Approved`** — the plan is reviewed and approved but not yet implemented
      (its `## Human Decisions` are all `Resolved` by the planner). Skip
      steps 1–2 and enter at step 3 (Implement).
    - **`Reviewing`**, or `plan.md`’s `**Status**` is `Needs Revision` — the plan
      was reviewed and rejected, and the run was interrupted before the planner
      could revise. Skip step 1 and enter the review loop at step 2d: delegate to
      `sdd-planner` to revise the plan using the consolidated findings in
      `review.md`, then `sdd-reviewer` to re-review (forwarding the planner’s
      returned revision response — see the Delegate contract).
      Preserve the persisted `**Review attempt**` counter.
    - **`Draft` or `Planned`** (no prior review) — if `plan.md` does not exist,
      enter at step 1 (Plan).
      If `plan.md` exists but has not been reviewed: re-read `issue.md`’s
      `## Human Decisions` — if any decision is still `Open` (interrupted before
      the before-implementation questions were resolved), enter at step 1 (Plan)
      to resolve them; otherwise enter the review loop at step 2a (initial
      review).

   Persisted attempt counters (`**Review attempt**`, `**Validation attempt**`,
   `**Cross-cutting attempt**`) are **preserved** across re-invocation —
   re-invoking `/prd-auto-implement` does NOT reset them.
   The only counter reset is the post-escalation resume described in steps 2e,
   4e, and Phase 3f (a distinct, user-driven event triggered by the `question`
   tool).

1. **Plan** — delegate to `sdd-planner` via the “task” tool.
   Its prompt tells it to load the `prd-issue-to-plan` instructions via the
   `sdd-command` tool and produce `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md` for
   this issue. The planner owns HITL: it reads the issue’s `## Human Decisions`
   and, for any decision whose `**Status**` is `Open`, stops and reports the
   question (with its `**Gate**` and `**Options**`) rather than writing the plan.
   Re-read `issue.md` and `plan.md` when it returns.

   - If the planner reports unresolved HITL decisions, surface them in a single
     `question` tool call (one question per decision, using each decision’s
     recorded `**Options**`), then **END YOUR TURN** — do not write the plan.
     When the user resumes with answers, for each answered decision edit
     `issue.md`’s `## Human Decisions`: fill its `**Answer**:` line and set its
     `**Status**` to `Resolved` (edit only those two fields per decision; leave
     the rest of the issue intact). Then re-dispatch `sdd-planner` and repeat
     from “Re-read ...” above.
   - If the planner reports the plan is written (no unresolved decisions), go to
     step 2.

2. **Review loop** — run the plan through a capped review loop, capped at
   `MAX_ATTEMPTS`.

   a. Delegate to `sdd-reviewer` via the “task” tool.
   Its prompt tells it to load the `prd-review-plan` instructions via
   `sdd-command` and review this issue’s plan, writing `review.md` (the reviewer
   sets `**Review attempt**` to `1` on the first review).
   Re-read `plan.md` and `review.md` when it returns.

   b. Read `plan.md`’s `**Status**`. The reviewer writes `**Status**: Approved`
   when the plan passes, or `**Status**: Needs Revision` when it fails.
   Also read `review.md`’s `**Review attempt**` counter (a missing report counts
   as `0`).

   c. If `**Status**` is `Approved`, the review loop is done — go to step 3.

   d. If `**Status**` is `Needs Revision` and the `**Review attempt**` counter
   is below `MAX_ATTEMPTS`, delegate to `sdd-planner` to revise the plan,
   feeding it the consolidated **Open** findings from `review.md` in the
   delegate prompt. Re-read `plan.md` when it returns.
   Then delegate to `sdd-reviewer` again to re-review (it increments
   `**Review attempt**` on each re-review), forwarding the planner’s returned
   revision response in the delegate prompt (see the Delegate contract) so
   the reviewer can verify how the prior findings were addressed.
   Re-read `plan.md` and `review.md` when it returns, then repeat from step b.

   e. If `**Status**` is `Needs Revision` and the `**Review attempt**` counter
   has reached `MAX_ATTEMPTS`, **escalate**: read the consolidated **Open**
   findings from `review.md`, use the `question` tool to surface them and ask
   how to proceed, then **END YOUR TURN** — do not delegate another review.
   When the user resumes with revision guidance, reset `**Review attempt**` to
   `0` in `review.md` (edit only that one counter line — keep the report body
   and prior findings intact), delegate to `sdd-planner` with the user’s
   guidance, then delegate to `sdd-reviewer` for a fresh review (so the next
   attempt starts at `1`), forwarding the planner’s returned revision response
   in the delegate prompt (see the Delegate contract), re-read `plan.md` and
   `review.md`, and repeat from step b.

3. **Implement** — delegate to `sdd-coder` via the “task” tool.
   Its prompt tells it to load the `prd-implement-issue` instructions via
   `sdd-command` and execute the plan for this issue.
   Re-read `issue.md` and `plan.md` when it returns.
   (Implementation is followed by the capped validation loop in step 4.)

4. **Validation loop** — run the implementation through a capped validation
   loop, capped at `MAX_ATTEMPTS`.

   a. Delegate to `sdd-validator` via the “task” tool.
   Its prompt tells it to load the `prd-validate-issue` instructions via
   `sdd-command` and validate this issue, writing `validation.md` (the validator
   sets `**Validation attempt**` to `1` on the first validation).
   Re-read `validation.md` when it returns.

   b. Read `validation.md`’s `**Overall Status**`. The validator writes
   `Complete` when the implementation passes (and sets the issue’s `**Status**`
   to `Validated`), or `Incomplete` or `Blocked` when it fails.
   Also read `validation.md`’s `**Validation attempt**` counter (a missing
   report counts as `0`).

   c. If `**Overall Status**` is `Complete`, the validation loop is done —
   proceed to the next issue (Phase 3 if this was the last issue).

   d. If `**Overall Status**` is `Incomplete` or `Blocked` and the
   `**Validation attempt**` counter is below `MAX_ATTEMPTS`, delegate to
   `sdd-coder` to fix the findings, feeding it the issues recorded under
   `## Issues Found` in `validation.md` in the delegate prompt.
   Re-read `issue.md` and `plan.md` when it returns.
   Then delegate to `sdd-validator` again to re-validate (it increments
   `**Validation attempt**` on each re-validation), forwarding the coder’s
   returned fix response in the delegate prompt (see the Delegate contract)
   so the validator can verify how the prior findings were addressed.
   Re-read `validation.md` when it returns, then repeat from step b.

   e. If `**Overall Status**` is `Incomplete` or `Blocked` and the
   `**Validation attempt**` counter has reached `MAX_ATTEMPTS`, **escalate**:
   read the findings from `validation.md`, use the `question` tool to surface
   them and ask how to proceed, then **END YOUR TURN** — do not delegate another
   validation. When the user resumes with fix guidance, reset
   `**Validation attempt**` to `0` in `validation.md` (edit only that one
   counter line — keep the report body and prior findings intact), delegate to
   `sdd-coder` with the user’s guidance, then delegate to `sdd-validator` for a
   fresh validation (so the next attempt starts at `1`), forwarding the coder’s
   returned fix response in the delegate prompt (see the Delegate contract),
   re-read `validation.md`, and repeat from step b.

### Phase 3: Cross-cutting validation loop

After every issue is validated, run the cross-cutting audit through a capped
loop, capped at `MAX_ATTEMPTS`. Before entering this phase, re-read every
issue’s `issue.md` and confirm every `**Status**` is `Validated`; if any is not,
return to Phase 2 for the unfinished issue.

a. Delegate to `sdd-validator` via the “task” tool.
Its prompt tells it to load the `prd-validate` instructions via `sdd-command`
and run the cross-cutting audit, writing `{SPECS_DIR}/validation.md` (the
validator sets `**Cross-cutting attempt**` to `1` on the first pass, or
increments the prior value on a re-validation).
Re-read `{SPECS_DIR}/validation.md` when it returns.

b. Read `{SPECS_DIR}/validation.md`’s `**Overall Status**` and
`**Cross-cutting attempt**` counter (a missing report counts as `0`).

c. If `**Overall Status**` is `Complete`, the cross-cutting loop is done — go to
step d (finalize).

d. **Finalize** — the feature is complete.
The `prd-validate` command (loaded by the validator) already renamed `.current`
to a dated slug when the overall status was `Complete`. Report the feature
complete, name the finalized specs directory (scan the parent of the original
`{SPECS_DIR}` for the new `yyyymmdd-*` directory), and stop.

e. If `**Overall Status**` is `Incomplete` or `Blocked` and the
`**Cross-cutting attempt**` counter is below `MAX_ATTEMPTS`: read the open
Critical and High findings under `## Cross-Cutting Findings` in `validation.md`
(a finding is “open” if it has not been marked `Fixed`). For each open
Critical/High finding, delegate to `sdd-coder` once via the “task” tool to make
a minimal targeted fix — its prompt names the specific finding to fix (with
enough detail from `validation.md` for the coder to locate it), tells it to
read `{SPECS_DIR}/validation.md` for the full finding details, and instructs
it to mark that finding `Fixed` in `{SPECS_DIR}/validation.md` (by adding a
`- **Status**: Fixed` line to the finding entry) after fixing it.
   Re-read `validation.md` after each coder returns.
   Then delegate to `sdd-validator` again to re-run the cross-cutting audit (it
   increments `**Cross-cutting attempt**` on each re-validation), forwarding
   the coder(s)’ returned fix response(s) in the delegate prompt (see the
   Delegate contract) so the validator can verify how the fixed findings were
   addressed.
   Re-read `validation.md` when it returns, then repeat from step b.

f. If `**Overall Status**` is `Incomplete` or `Blocked` and the
`**Cross-cutting attempt**` counter has reached `MAX_ATTEMPTS`, **escalate**:
read the findings from `{SPECS_DIR}/validation.md`, use the `question` tool to
surface them and ask how to proceed, then **END YOUR TURN** — do not delegate
another validation. When the user resumes with fix guidance, reset
`**Cross-cutting attempt**` to `0` in `{SPECS_DIR}/validation.md` (edit only
that one counter line — keep the report body and prior findings intact),
delegate to `sdd-coder` with the user’s guidance (instructing it to address
the findings directly from the dispatch prompt — reading
   `{SPECS_DIR}/validation.md` for details and marking each fixed finding
   `Fixed` as in step e), then delegate
   to `sdd-validator` for a fresh cross-cutting audit (so the next attempt starts
   at `1`), forwarding the coder’s returned fix response in the delegate prompt
   (see the Delegate contract), re-read `validation.md`, and repeat from step b.

## Delegate contract

Every delegation uses the “task” tool with:

- `subagent_type`: one of `sdd-planner`, `sdd-reviewer`, `sdd-coder`,
  `sdd-validator`.
- `description`: a short label for the delegation.
- `prompt`: the worker’s instructions. Usually this tells the worker to use
  the `sdd-command` tool to load instructions for a `prd-*` command (e.g.
  `prd-issue-to-plan`) and follow them for this issue; for the cross-cutting
  coder fixes (Phase 3 steps e/f) it carries the fix instructions directly.
  The worker already has `sdd-command` enabled; you do not.
- `prompt` on a re-review or re-validation: whenever a worker produced a
  revision you are about to send back to a reviewer or validator (a planner
  re-plan in step 2, a coder fix in step 4, or a cross-cutting coder fix in
  Phase 3), forward that worker’s returned response in the next
  reviewer/validator dispatch prompt under a clearly labelled
  `Prior revision response:` section. The reviewer/validator uses it to verify
  how the prior findings were addressed against the revised artifact; without it
  the next reviewer/validator sees only the on-disk report.

You never call `sdd-command` yourself.
You never edit spec files yourself, with TWO exceptions:

- On post-escalation resume you reset a single loop counter
  (`**Review attempt**`, `**Validation attempt**`, or
  `**Cross-cutting attempt**`) to `0` in the relevant report file, preserving
  the rest of the report.
- When the planner reports unresolved `## Human Decisions`, you record each
  answer it returned: fill the decision’s `**Answer**:` line and set its
  `**Status**` to `Resolved` in `issue.md` (only those two fields per
  decision; leave the rest of the issue intact).
Your `ask` permission gates both edits.
You only orchestrate.

## Guidelines

- **Delegate everything**: no stage work is done by you; delegate to the
  matching subagent for every plan, review, implementation, and validation.
- **Re-read before deciding**: never decide the next step on stale state;
  re-read the relevant spec files before each delegation.
- **Numeric order**: process issues by their leading numeric ID.
- **HITL mediation**: the planner owns HITL detection and timing. When it
  reports unresolved `## Human Decisions`, surface them via the `question`
  tool (one question per decision), end your turn, record the answers in
  `issue.md` (`**Answer**:` + `**Status**: Resolved`), and re-dispatch the
  planner. `AFK` issues (or HITL issues whose decisions are all `Resolved`)
  proceed without asking.
- **Review cap**: the plan-review loop is capped at `MAX_ATTEMPTS` (default `3`)
  with escalation and resume.
- **Validation cap**: the per-issue implement-validate loop is capped at
  `MAX_ATTEMPTS` (default `3`) with escalation and resume.
- **Cross-cutting cap**: after every issue is validated, the cross-cutting audit
  loop is capped at `MAX_ATTEMPTS` (default `3`) with escalation and resume; on
  success the specs directory is finalized (renamed from `.current` to a dated
  slug).
- **Forward revision responses**: every re-review or re-validation dispatch
  (after a planner re-plan, a coder fix, or a cross-cutting coder fix) carries
  the revising worker’s returned response under a `Prior revision response:`
  section, so the reviewer/validator can verify how the prior findings were
  addressed instead of re-deriving the changes from disk alone.
- **No fresh-start stages**: if the PRD or issues are missing, hard-stop with
  the error above; do not run `prd-write` or `prd-to-issues`.
- **Resume is idempotent**: re-invoking `/prd-auto-implement` after an interruption
  (crash, manual stop, or escalation) picks up where it left off.
  Read each issue’s current `**Status**` and the persisted counters before
  deciding where to start — never redo completed work and never reset counters
  except on post-escalation resume.
