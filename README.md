# opencode-sdd

[![CI](https://github.com/ameshkov/opencode-sdd/actions/workflows/ci.yml/badge.svg)](https://github.com/ameshkov/opencode-sdd/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/opencode-sdd)](https://www.npmjs.com/package/opencode-sdd)
[![GitHub release](https://img.shields.io/github/v/release/ameshkov/opencode-sdd)](https://github.com/ameshkov/opencode-sdd/releases)

<p align="center">
    Specification-Driven Development for OpenCode.
</p>

<p align="center">
    <img src="docs/assets/demo.gif"
         alt="OpenCode SDD Demo" width="600"/>
</p>

You describe what you want in vague terms.
The plugin produces a complete, validated development plan — PRD, issues,
implementation plans, and validation reports — with every phase running in a
clean, isolated session.

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Install](#install)
    - [Manual install](#manual-install)
- [The SDD Short Flow](#the-sdd-short-flow)
- [The PRD Long Flow](#the-prd-long-flow)
    - [Auto-Implement](#auto-implement)
- [Keeping Documentation Current](#keeping-documentation-current)
- [Honorable Mentions](#honorable-mentions)
- [Additional Resources](#additional-resources)

## The Problem

AI coding agents are great at writing code, but they're terrible at *planning*
code. You tell an agent “build a payment system” and it starts typing without
requirements, architecture, or validation. By the time you realize it built the
wrong it built the wrong thing, you’ve burned a session full of context and
a pile of tokens.

## The Solution

**opencode-sdd** is a tool that let's you have a proper workflow:
**plan everything before you build anything.**

## Install

The quickest way to set up `opencode-sdd` is the `install` wizard. It
edits your `opencode.json` (or `opencode.jsonc`) to register the plugin
and assign a model to each SDD subagent.

Run (via `npx`, no global install needed):

```sh
npx opencode-sdd install
```

The wizard detects the `opencode` binary on PATH, discovers patchable
configs (global, an `OPENCODE_CONFIG` override, or project-local), probes
the models reachable from your configured providers, recommends a
per-subagent model, shows a before/after diff, and writes the change with
an idempotent, comment- and order-preserving patch. Re-running it with
the same selection leaves the file byte-for-byte unchanged.

Pass `-y` (or `--yes`) for a fully unattended install: it auto-selects
the recommended model per subagent *and* skips the confirmation gate.

```sh
npx opencode-sdd install --yes
```

The wizard edits configuration only; opencode itself installs the plugin
from the npm registry on the next restart. Restart opencode (or start a
new session) to load it — the `/sdd-*`, `/prd-*`, and `/doc-*` commands
become available immediately. Run `npx opencode-sdd --help` for the full flag
list. This Install section is kept in sync with the wizard's flags as
part of the feature's definition of done — if the flags or behaviour
change, this section is updated.

### Manual install

If you prefer to edit config by hand, add `opencode-sdd` to the `plugin`
array in your `opencode.json` (or `opencode.jsonc`):

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["opencode-sdd"]
}
```

Then restart opencode as described above. The manual path registers the
plugin but does not set per-subagent models — run
`npx opencode-sdd install` afterwards to assign them, or set each
`agent["<subagent>"].model` entry yourself.

The six SDD subagents are `sdd-planner`, `sdd-reviewer`, `sdd-coder`,
`sdd-validator`, `sdd-plan-reviewer`, and `sdd-explore`.
The value is a `provider/model` string from one of your configured
providers. Add a top-level `agent` object mapping each subagent name to
an object whose `model` field is that string — for example:

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["opencode-sdd"],
    "agent": {
        "sdd-planner": { "model": "anthropic/claude-sonnet-4" },
        "sdd-reviewer": { "model": "anthropic/claude-sonnet-4" },
        "sdd-coder": { "model": "anthropic/claude-sonnet-4" },
        "sdd-validator": { "model": "anthropic/claude-sonnet-4" },
        "sdd-plan-reviewer": { "model": "openai/gpt-4o-mini" },
        "sdd-explore": { "model": "openai/gpt-4o-mini" }
    }
}
```

Replace the example `provider/model` values with the IDs your providers
expose (run `npx opencode-sdd install` to see them listed and recommended
per subagent). The four heavyweight agents (`sdd-planner`,
`sdd-reviewer`, `sdd-coder`, `sdd-validator`) benefit from a strong
reasoning/coding model; the two read-only researchers (`sdd-plan-reviewer`
and `sdd-explore`) can use a cheaper/faster one. The tier split is
defined in `src/cli/recommend.ts` (`SUBAGENT_RECOMMENDATIONS`) — it is
the source of truth the install wizard consults.

## The SDD Short Flow

For a small change you can analyze, implement, and verify in three commands.
Each command runs with your current agent — no dedicated orchestrator is
required.

1. Describe the change and produce a lightweight plan.
2. Implement the plan's tasks following the TDD flow.
3. Validate the result and write a report.

- `/sdd-spec` — analyze a problem and write `SPECS_DIR/spec.md`
  (problem analysis, affected files, proposed solution, and tasks).
- `/sdd-implement` — run the tasks defined in `spec.md` using the TDD flow
  (write failing test → verify failure → implement → verify pass).
- `/sdd-validate` — validate the implementation and write
  `SPECS_DIR/validation.md`.

If `/sdd-validate` reports an incomplete implementation, loop:
`/sdd-implement` → `/sdd-validate` → `/sdd-implement` → `/sdd-validate`.
Each revision marks the validation's issues as resolved and sets the
overall status to `Revised`; re-run `/sdd-validate` until the overall
status is `Complete`.

`SPECS_DIR` defaults to `.sdd/.current/`.

It's up to you whether you want to keep that directory in source control.

## The PRD Long Flow

For a larger feature, drive requirements through validated implementation
in six steps (plus an optional plan review). Each step runs in a clean
session and produces the next artifact.

1. Write a product spec from a feature description.
2. Break the spec into independent vertical-slice issues.
3. Plan a single issue.
4. *(Optional)* Review that issue's plan before implementing it.
5. Implement that issue's plan.
6. Validate that issue against its plan.
7. Cross-validate every implemented issue.

- `/prd-write` — produce `SPECS_DIR/prd.md` from a feature description.
- `/prd-to-issues` — write vertical-slice issues under `SPECS_DIR/issues/`.
- `/prd-issue-to-plan` — write a plan for one issue.
- `/prd-review-plan` — *(optional)* review a plan across six dimensions;
  writes `review.md` and sets the plan's status to Approved or Needs
  Revision.
- `/prd-implement-issue` — run one issue's plan.
- `/prd-validate-issue` — validate one issue against its plan.
- `/prd-validate` — cross-validate all implemented issues and write
  `SPECS_DIR/validation.md`.

The two quality gates are iterative — you loop on them until the artifact
passes:

- **Plan review loop** — `/prd-issue-to-plan` → `/prd-review-plan` →
  `/prd-issue-to-plan` → `/prd-review-plan` … Each revision marks the
  review's findings as resolved and sets the verdict to `Revised`; re-run
  `/prd-review-plan` until the verdict is `Approved`.
- **Implementation validation loop** — `/prd-implement-issue` →
  `/prd-validate-issue` → `/prd-implement-issue` → `/prd-validate-issue` …
  Each revision marks the validation's issues as resolved and sets the
  overall status to `REVISED`; re-run `/prd-validate-issue` until the
  overall status is `COMPLETE`.

### Auto-Implement

Once the PRD and its issues exist (steps 1–2 above), `/prd-auto-implement`
orchestrates the rest in a single session under whatever agent you invoke it
with — no dedicated orchestrator agent is required:
it plans, reviews, implements, and validates every issue in numeric order,
then runs the cross-cutting validation. It hard-stops if the PRD or issues
are missing. Each review, validation, and cross-cutting loop is capped at
`MAX_ATTEMPTS` (default `3`) and escalates to you when it can't converge;
re-running it after an interruption (crash, stop, or escalation) resumes
where it left off without redoing completed work.

- `/prd-auto-implement` — orchestrate the full PRD implementation end-to-end.
  `SPECS_DIR` (default `.sdd/.current/`) sets where specs live; `MAX_ATTEMPTS`
  (default `3`) caps every loop.

The full run can take hours depending on the number of issues. A `HITL` issue
records its human decisions in a `## Human Decisions` section, each tagged
`before-planning` or `before-implementation`. The planner (`prd-issue-to-plan`)
owns HITL: it asks those decisions at their gate (before-planning before it
writes the plan, before-implementation after), and records your answers back in
the issue. Under `/prd-auto-implement` it surfaces the questions to you, records
your answers, and re-dispatches the planner. `AFK` issues proceed without
asking.

## Keeping Documentation Current

The `doc-*` commands update the project's standard documentation files to
match the codebase. Run them after a change that affects the corresponding
file.

- `/doc-readme` — update `README.md` to stay a user manual.
- `/doc-development` — update `DEVELOPMENT.md` (build and debug guide).
- `/doc-deployment` — update `DEPLOYMENT.md`.
- `/doc-agents` — update `AGENTS.md` (guidelines and project structure).
- `/doc-changelog` — add the Unreleased entry to `CHANGELOG.md`.

## Honorable Mentions

- [ascii-gif](https://github.com/tamnd/ascii-gif) — used to generate the
  demo GIF in this README.
- [spec-kit](https://github.com/github/spec-kit) — this project was
  originally inspired by GitHub's Spec Kit, but is essentially a simplified
  version of it.

## Additional Resources

- [AGENTS.md](./AGENTS.md) — code guidelines, project structure, and the
  plugin surface contract.
- [DEVELOPMENT.md](./DEVELOPMENT.md) — build and debug guide.
- [CHANGELOG.md](./CHANGELOG.md) — release history.
- [`docs/e2e.md`](./docs/e2e.md) — how the mock-LLM e2e suite works,
  including the template-rewriting mechanism.
