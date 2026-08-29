---
name: manual-test-run
description: Run a set of manual Gherkin QA tests — get the test environment up and current, execute the selected scenarios against it, verify each observable effect, and record pass/fail/skip verdicts with the manual test runner. Use when asked to run manual tests, execute a QA plan, run the recommended cases for a changeset, or produce a QA run report.
---

# Running Manual QA Tests

Workflow for running one or more Gherkin scenarios from a project's
manual QA plans against the project's test environment, and
recording the verdicts in a run report.

## Assumed layout

The only artifacts this workflow relies on:

- `qa/features/` — Gherkin test plans (one file per area)
- `qa/scripts/bdd/` — the manual test runner scripts
- Root `package.json` — exposes the `qa:run` (runner) and
  `lint:gherkin` (lint) scripts
- `qa/README.md` — instructions: the test environment, how to
  start it, how the runner is invoked

Everything else — what the test environment is, how it is started,
what inputs the plans assume, how to inspect results — is project
specific and documented in `qa/README.md`. Do not assume this is a
server, a specific runtime, or the host package manager.

## When this applies

- "Run the manual tests for this change"
- "Run the recommended cases" (a list chosen by
  `qa-test-planning`)
- "Execute `<feature>` / `<case-id>`"
- "Produce a QA run report"

## Source of truth: qa/README.md

**Read `qa/README.md` first — it is the source of truth.** It
describes the test environment's layout, how to start it, the
inputs the plans assume, and the exact command used to run the
tests. Anything in this skill that conflicts with the README loses
— the README is updated with the stack; this skill only describes
the run workflow.

Wherever this skill shows a command, the README names the exact
invocation. The `qa:run` script in the root `package.json` invokes
`qa/scripts/bdd/run-tests.ts` and is normally run from the
repository root.

## Step 0 — Preflight: the environment is up and current

The plans are worthless against a stale or unprepared environment.
Check before executing anything:

1. **Is the environment running?** Follow the README's start
   steps; confirm its services are up.
2. **Is it current?** If the environment was set up before the
   change under test, rebuild or restart it per the README — an
   environment running old code tells you nothing about current
   code. For this suite: rebuild the workspace image when plugin
   source changed (`docker compose -f qa/docker-compose.yml build qa`).
3. **Are the plan's assumed inputs in place?** The plans assume a
   specific configuration/state (the scratch project, the wired
   `opencode.json`, the provisioned OpenRouter provider). Verify
   what the README says is deployed matches the repo's baseline; if
   it drifted, restore it.
4. **Health check.** Confirm the environment answers the README's
   health check. Note any networking quirks documented there (the
   gateway is reachable inside the workspace as
   `http://bifrost:8080`, never `localhost`).
5. **Fail fast on broken tooling.** If the environment cannot be
   prepared, fix the cause first — do not start executing
   scenarios against an old setup.

## Step 1 — Pick and enumerate the cases

Enumerate the selected cases and the exact order the runner will
walk them:

```bash
pnpm qa:run --list                    # every scenario, every file
pnpm qa:run --feature <name> --list   # one feature file
pnpm qa:run --id <case-id>            # one scenario id
```

Important: when you select a **feature file**, the runner walks
**every** scenario in that file in file order, expanding
`Scenario Outline` examples rows into one case per row (sharing the
ID). Your run must account for all of them — selected or not.

## Step 2 — Execute each scenario before recording

Scenarios are instructions a human tester carries out. Perform them
against the running environment; do not record a verdict you have
not verified.

Typical verification surfaces (which apply depends on the project;
the README documents the ground truth for each):

- **Artifacts** — the SDD flows write `spec.md` / `prd.md` /
  `plan.md` / `validation.md` under `.sdd/`; assert the sections
  and statuses the scenario names (copy them out with `docker
  compose -f qa/docker-compose.yml cp qa:/work/sdd-manual/...`).
- **Logs** — the opencode server log and the plugin registration
  markers (the marker table is in `qa/README.md`); grep inside the
  workspace container.
- **Upstream-facing behavior** — what the gateway saw and sent:
  the request log at `GET http://bifrost:8080/api/logs` (via
  `qa exec 'curl ...'`) carries prompts, models, tokens, cost.
- **TUI behavior** — run in an interactive session
  (`qa exec 'opencode'`); assert on what renders and the
  permission prompts shown, preferring text over screenshots.
- **CLI behavior** — the wizard is exercised with
  `qa exec 'node /app/build/cli/install.js ...'`; assert
  stdout/stderr text and exit codes.

If a scenario's steps do not match the current implementation
(stale plan), record it honestly — fail or skip with a note
explaining the drift — and report it, rather than passing it
anyway. Fixing stale plans is the job of the
`qa-test-planning` workflow, not this one.

## Step 3 — Record verdicts with the runner

The runner is interactive: for each case it prints the steps, then
asks for a verdict and a description. Feed it one verdict line
(`p`/`f`/`s`, anything else counts as pass) and one description
line per case.

**Alignment is the #1 failure mode.** Because a feature-file run
walks all cases, build the input for **exactly** the cases the
runner will encounter, in file order, and never drop cases:

- Selected cases: real verdict + the verification you performed.
- Cases you did not select or could not run (not in the requested
  set): `s` (skip) with a one-line reason ("not part of the
  requested run").

Pipe the input into the runner, or answer interactively — the
README shows the exact way to invoke it with the selected filter
and a run id.

Use a stable run id (when the runner offers one) so reports are
findable and repeat runs do not collide. Reports land in
`qa/output/<run-id>/`, written progressively so an interrupted run
keeps its results.

## Step 4 — Verify the report

After the run, check the generated report:

- The summary counts the right number of cases for the selection
  (no dropped cases — a count that is short usually means the input
  ended early and the last cases were lost).
- The per-scenario statuses/notes align with the cases you meant to
  record (runner order = file order; check a couple of IDs, not
  just the summary).
- Every `fail`/`skip` carries a note a human can act on.

## Step 5 — Clean up temporary files

The run may create temporary files outside the run report: browser
snapshots, screenshots, dumps, scratch configs, and similar scratch
artifacts. Remove them once the run is finished — leave the working
tree clean except for the generated report (`qa/output/<run-id>/`)
and the evidence the README asks you to collect
(`qa/evidence/<date>-<group>/`).

- Known temporary locations: check the README for where the runner
  or tooling writes scratch files; if none are documented, scan for
  files created during the run (recent files in the project,
  browser profile/temp dirs, downloaded artifacts).
- Do not delete anything that is part of the run report or the
  environment's baseline — only scratch artifacts created by your run.
- Prefer `rm` on the exact scratch paths you created; do not sweep
  broad directories that could contain unrelated files.

## Pitfalls worth remembering

- **Stale environment** — the most common cause of "everything
  fails": it was started before the change under test. Rebuild.
- **Baseline drift** — a modified baseline input left behind
  changes what the scenarios observe (a patched `opencode.json`, a
  dirty scratch project, a removed provider). Always restore it.
- **Environment-dependent inputs** — the plan inputs may reference
  variables/config that must be present; a missing one can change
  (or break) what is observed, and is itself sometimes a scenario.
  Check `qa/README.md` for what the plans assume.
- **Runner input truncation** — an extra or missing line shifts
  every verdict after it. Keep the case list authoritative
  (`--list`) and check alignment afterwards.
- **Environment-specific networking** — the README documents any
  reachability quirks (gateway reachable as `http://bifrost:8080`
  inside the workspace, host-side only with the ports override)
  that affect how the environment is contacted.
- **Cost** — inference is billed to the OpenRouter key. Follow the
  README's token guidance: batch by group, stay on the cheap
  default, check `/api/logs` before re-running a group.

## Reference files

- `qa/README.md` — instructions; the source of truth for every
  command
- `qa/features/` — Gherkin plans, one file per area
- `qa/scripts/bdd/` — the manual test runner scripts
- Root `package.json` — exposes the `qa:run` script that invokes the
  runner
