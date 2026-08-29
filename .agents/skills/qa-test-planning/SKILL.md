---
name: qa-test-planning
description: Analyze a changeset (commit, branch, or feature) against a project's manual Gherkin QA plans, map its behaviors to existing test cases, add or update scenarios for missing coverage, and select a curated list of test cases to run in a manual QA session. Use when asked to check QA coverage for a commit or branch, update feature files, add scenarios, or pick which test cases to run to validate a change.
---

# QA Test Planning for Changesets

Workflow for a project with manual QA plans: take a code change,
figure out what the existing feature files already cover, close the
important gaps, and hand back a prioritized list of test cases for
the manual run.

## Assumed layout

The only artifacts this workflow relies on:

- `qa/features/` — Gherkin test plans (one file per area)
- `qa/scripts/bdd/` — the manual test runner and the
  test-ID-check scripts
- Root `package.json` — exposes the `qa:run` (runner) and
  `lint:gherkin` (lint) scripts
- `qa/README.md` — instructions: the test environment, how to
  start it, the inputs the plans assume, how the runner is invoked

Everything else is project specific and documented in
`qa/README.md`. Do not assume this is a server, a specific runtime,
or the host package manager. The `qa:run` and `lint:gherkin`
scripts are normally run from the repository root.

## When this applies

- "Check QA coverage for a commit / branch / feature"
- "Update or add test cases"
- "Select test cases to run to validate this change"
- "What could this change have broken?"

## Scope — when coverage is needed

Plans exist to validate the project's shipped functionality. A
changeset needs new or updated scenarios only when it changes
behavior users or operators observe — entry points (CLI, TUI,
plugin registration), configuration handling, artifact content,
failure paths, and so on.

Changes to supporting tooling do not need Gherkin coverage:

- test infrastructure itself (the mock LLM, e2e harness, runner
  scripts, CI setup)
- fixtures, sample data, benchmark or test agents
- internal refactors with no observable behavior change

Still keep existing plans honest: if a tooling change alters what a
scenario observes (different log markers, changed artifact shapes,
changed error strings), update the affected steps in the same
change.

## Step 1 — Understand the changeset

Do not trust the commit message alone; read the actual diff.

```bash
git show --stat <commit>
git show <commit> -- <path>         # per-file
git log <base>..<branch> --oneline   # a branch's commits
git diff <base>...<branch> --stat    # full branch diff
```

For each touched file, note what behavior it changes and which
consumers it feeds. Pay special attention to edits in shared or
chained code paths — a small change in a widely used module
affects every caller, not just the feature it was made for.
Those are the regression candidates.

## Step 2 — Build the coverage matrix

Map every behavior from the changeset to an existing test case:

- Read the relevant feature files in `qa/features/` and the
  baseline inputs the plans assume (the `qa/README.md` describes
  both).
- Bullet per behavior: "Behavior — covered by / not covered".
- Plans are often written right after the feature, so coverage
  may already be close to complete. Verify rather than assume.

Common gap classes, in order of likelihood:

- **Combination gaps**: each path is tested alone but the
  interaction is not (e.g. a command used after a HITL decision,
  or the wizard on top of an existing user config). These are the
  most valuable additions.
- **Entry-point gaps**: the feature is tested through one entry
  point but not the others (the CLI wizard vs the config hook, or
  a command vs the orchestrator). Only add these when the entry
  points actually differ — if they share a code path, coverage on
  one surface plus the shared path is enough.
- **Stale wording**: a scenario title or step that no longer
  matches the behavior it exercises. Fix the wording, don't
  leave drift.
- **Config edge cases**: missing validation branches (empty
  values, forbidden names, malformed JSONC); check what the
  existing scenarios already cover before adding.

## Step 3 — Add / update scenarios

Follow the file's existing style; steps are written as instructions
a human tester carries out against the test environment. Use the
`Given` / `When` / `Then` keyword for preconditions / actions /
observations, and `And` for additional steps of the same kind.

- One ID tag per scenario, following the suite's ID convention
  (`@TC-<GROUP>-<case>`, group prefix per file, case number in
  sequence, unique across the suite; enforced by
  `qa/scripts/bdd/check-gherkin-ids.ts`).
- Add a priority tag (`@P0` blocking, `@P1` core, `@P2`
  nice-to-have) matching the suite's exit criteria.
- Verify effects the way the plans already do — file assertions,
  log markers (the marker table lives in `qa/README.md`),
  gateway `/api/logs`, TUI-visible behavior.
- Use `Scenario Outline` + `Examples:` for table-driven variants
  (each examples row is executed as a separate case by the
  runner, sharing the ID).
- Before adding a scenario, confirm the behavior is real in the
  implementation, so the manual tester is not asked to verify
  something the system does not do.

## Step 4 — Verify

The ID convention and Gherkin syntax are enforced automatically:

```bash
pnpm lint:gherkin
```

Do not weaken existing scenarios to make a new one fit — keep the
plan honest. If the environment itself changed (new scripts, tools,
start steps), update `qa/README.md` in the same change.

## Step 5 — Select cases for the manual run

Return two groups, each a flat list of case IDs with a one-line
rationale per entry:

- **A — new functionality**: every case that exercises the feature
  itself (its behaviour, validation, persistence, any UI
  surfacing), including the newly added combination cases.
  These must all pass.
- **B — potentially broken**: cases covering shared code paths the
  changeset touched — mainline happy paths of each entry point,
  error and retry paths, registration/config-loading regressions.
  Pick representative cases; no need to run the whole suite, but
  cover each changed layer at least once.

Order Phase A first, then Phase B. Mention the runner usage (the
`qa:run` script that invokes `qa/scripts/bdd/run-tests.ts`; the
README documents the exact command and flags):

```bash
pnpm qa:run --list                    # enumerate cases
pnpm qa:run --feature <name>          # one feature file
pnpm qa:run --id <case-id>            # one case
pnpm qa:run --auto-pass --run-id <id> # record-only run
```

The runner is interactive — the tester marks each case
pass/fail/skip and records a free-text description; reports land in
`qa/output/` (typically `qa/output/<run-id>/report.md`).

## Reference files

- `qa/features/` — Gherkin plans, one file per area
- `qa/scripts/bdd/` — the manual test runner and check scripts
- Root `package.json` — exposes the `qa:run` (runner) and
  `lint:gherkin` (checks) scripts
- `qa/README.md` — instructions, must stay in sync with the
  environment
