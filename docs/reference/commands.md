# Slash Command Reference

`opencode-sdd` registers 11 slash commands. Every command runs in the
session you invoke it in — there is no dedicated orchestrator agent — and
writes its artifacts under `SPECS_DIR`.

## Shared inputs

- `SPECS_DIR` — the directory SDD artifacts live in; default
  `.sdd/.current/`.
- `MAX_ATTEMPTS` — the loop cap for `/prd-auto-implement`; default `3`.

## SDD short flow

- `/sdd-spec` — analyze a problem and write `{SPECS_DIR}/spec.md`: problem
  analysis, affected files, proposed solution, and tasks.
- `/sdd-implement` — run the tasks defined in `spec.md` using the TDD flow
  (write failing test → verify failure → implement → verify pass).
- `/sdd-validate` — validate the implementation and write
  `{SPECS_DIR}/validation.md`.

The report's `Overall Status` is `Complete`, `Incomplete`, or `Revised`.
When validation is incomplete, `/sdd-implement` marks the report's issues as
resolved and sets the status to `Revised`; re-run `/sdd-validate` until it
is `Complete`.

## PRD long flow

- `/prd-write` — produce `{SPECS_DIR}/prd.md` from a feature description.
- `/prd-to-issues` — write vertical-slice issues under
  `{SPECS_DIR}/issues/`.
- `/prd-issue-to-plan` — write a plan for one issue.
- `/prd-review-plan` — review a plan across six dimensions and write
  `review.md`. The review verdict is `Approved`, `Rejected`, or `Revised`;
  the plan's status is set to `Approved` or `Needs Revision`.
- `/prd-implement-issue` — run one issue's plan.
- `/prd-validate-issue` — validate one issue against its plan and write
  `{SPECS_DIR}/issues/{ISSUE_ID}/validation.md`.
- `/prd-validate` — cross-validate all implemented issues and write
  `{SPECS_DIR}/validation.md`.
- `/prd-auto-implement` — orchestrate the pipeline (see below).

The plan-review gate loops `/prd-issue-to-plan` → `/prd-review-plan` until
the verdict is `Approved`; each revision sets it to `Revised`. The
implementation gate loops `/prd-implement-issue` → `/prd-validate-issue`
until the validation's `Overall Status` is `Complete`; each revision sets it
to `Revised`.

## Auto-implement

`/prd-auto-implement` orchestrates steps 3–7 of the PRD long flow in a
single session under whatever agent you invoke it with:

- Hard-stops when the PRD or the issues are missing.
- Plans, reviews, implements, and validates every issue in numeric order,
  then runs the cross-cutting validation.
- Caps the review, validation, and cross-cutting loops at `MAX_ATTEMPTS`
  (default `3`) and escalates to you when a loop cannot converge.
- Resumes after an interruption (crash, stop, or escalation) without
  redoing completed work.

An issue that needs human input carries a `## Human Decisions` section whose
entries are tagged `before-planning` or `before-implementation`. The planner
asks those questions at the matching gate (before writing the plan, or after
it); under `/prd-auto-implement` the questions are surfaced to you and the
answers recorded back in the issue before the planner is re-dispatched.
`AFK` issues proceed without asking.

## See also

- [Install CLI Reference](./install-cli.md) — the install wizard.
- [README](../../README.md#quick-start) — the short-flow walkthrough.
