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

AI coding agents are great at writing code, but they are terrible at
*planning* it. You tell an agent "build a payment system" and it starts
typing without requirements, architecture, or validation. By the time you
realize it built the wrong thing, you have burned a session full of context
and a pile of tokens.

**opencode-sdd** gives you a proper workflow: **plan everything before you
build anything.** The plugin produces a complete, validated development plan
— PRD, issues, implementation plans, and validation reports — with every
phase running in a clean, isolated session.

## Table of Contents

- [Install](#install)
    - [Manual install](#manual-install)
    - [Canary](#canary)
- [Quick Start](#quick-start)
- [The PRD Long Flow](#the-prd-long-flow)
    - [Auto-Implement](#auto-implement)
- [Honorable Mentions](#honorable-mentions)
- [Documentation](#documentation)

## Install

The quickest way to set up `opencode-sdd` is the `install` wizard. It edits
your `opencode.json` (or `opencode.jsonc`) to register the plugin and assign
a model to each SDD subagent. Run it via `npx` (no global install needed):

```sh
npx opencode-sdd install
```

The wizard detects the `opencode` binary and its host line, discovers
patchable configs (project-local, an `OPENCODE_CONFIG` override, or
global), probes the models reachable from your providers, recommends a
per-subagent model, shows a before/after diff, and writes the change with
an idempotent, comment- and order-preserving patch. Pass `-y` (or
`--yes`) for a fully unattended install:

```sh
npx opencode-sdd install --yes
```

**Supported opencode versions:** 1.x at or above **1.18.29**, and 2.x
(2.0.x). The wizard writes the config shape native to the detected host
(`plugin`/`provider` on V1, `plugins`/`providers` on V2) and refuses an
unsupported 1.x release with an upgrade hint.

The wizard edits configuration only; opencode installs the plugin from the
npm registry on the next restart. Restart opencode (or start a new session)
to load it — the `/sdd-*` and `/prd-*` commands become available
immediately. Run `npx opencode-sdd --help` for the full flag list and
`npx opencode-sdd --version` to print the installed version. See the
[Install CLI Reference](./docs/reference/install-cli.md) for the workflow,
the plugin entry forms, canary pinning, and the model recommendation rules.

### Manual install

To edit config by hand, add `opencode-sdd` to your `opencode.json` (or
`opencode.jsonc`). On opencode 1.x it goes in the `plugin` array:

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["opencode-sdd"]
}
```

On opencode 2.x the key is `plugins` (the same npm entry works — V2
resolves the package by name):

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugins": ["opencode-sdd"]
}
```

Then restart opencode as described above. The manual path registers the
plugin but does not set per-subagent models — run
`npx opencode-sdd install` afterwards, or set each
`agent["<subagent>"].model` entry yourself. The six SDD subagents are
`sdd-planner`, `sdd-reviewer`, `sdd-coder`, `sdd-validator`,
`sdd-plan-reviewer`, and `sdd-explore`; the
[Install CLI Reference](./docs/reference/install-cli.md#manual-install-equivalent)
shows a complete config example and the recommendation rules.

### Canary

Every push to `master` publishes a fresh canary build to the `canary` npm
dist-tag. Use it to try the latest unreleased work:

```sh
npx opencode-sdd@canary install
```

Canary builds never touch `latest`; stable `v*` releases are published the
usual way. The canary wizard pins `"opencode-sdd@canary"` in your config, so
opencode loads the canary build it self-pinned. See the
[Install CLI Reference](./docs/reference/install-cli.md#plugin-entry-forms)
for the supported plugin entry forms.

## Quick Start

For a small change you can analyze, implement, and verify in three commands.
Each command runs with your current agent — no dedicated orchestrator is
required.

1. `/sdd-spec` — describe the change; it writes a lightweight plan to
   `{SPECS_DIR}/spec.md` (problem analysis, affected files, proposed
   solution, and tasks).
2. `/sdd-implement` — run the plan's tasks using the TDD flow (write
   failing test → verify failure → implement → verify pass).
3. `/sdd-validate` — validate the result and write
   `{SPECS_DIR}/validation.md`.

If `/sdd-validate` reports an incomplete implementation, loop
`/sdd-implement` → `/sdd-validate` until the overall status is `Complete`.

`SPECS_DIR` defaults to `.sdd/.current/`; whether to keep that directory in
source control is up to you. See the
[Slash Command Reference](./docs/reference/commands.md#sdd-short-flow) for
the full short-flow semantics.

## The PRD Long Flow

For a larger feature, drive requirements through validated implementation in
six steps (plus an optional plan review). Each step runs in a clean session
and produces the next artifact.

1. `/prd-write` — write a product spec (`{SPECS_DIR}/prd.md`) from a
   feature description.
2. `/prd-to-issues` — break the spec into independent vertical-slice issues
   under `{SPECS_DIR}/issues/`.
3. `/prd-issue-to-plan` — write a plan for one issue.
4. `/prd-review-plan` — *(optional)* review that issue's plan across six
   dimensions; writes `review.md` and sets the plan's status to `Approved`
   or `Needs Revision`.
5. `/prd-implement-issue` — run one issue's plan.
6. `/prd-validate-issue` — validate one issue against its plan.
7. `/prd-validate` — cross-validate all implemented issues and write
   `{SPECS_DIR}/validation.md`.

The two quality gates are iterative: loop `/prd-issue-to-plan` →
`/prd-review-plan` until the review verdict is `Approved`, and
`/prd-implement-issue` → `/prd-validate-issue` until the validation's
overall status is `Complete`. See the
[Slash Command Reference](./docs/reference/commands.md#prd-long-flow) for
the report statuses and revision semantics.

### Auto-Implement

Once the PRD and its issues exist (steps 1–2 above), `/prd-auto-implement`
orchestrates the rest in a single session under whatever agent you invoke it
with — no dedicated orchestrator agent is required: it plans, reviews,
implements, and validates every issue in numeric order, then runs the
cross-cutting validation. It hard-stops if the PRD or issues are missing.
Each loop is capped at `MAX_ATTEMPTS` (default `3`) and escalates to you
when it cannot converge; re-running it after an interruption (crash, stop,
or escalation) resumes where it left off without redoing completed work.

An issue that needs human input records its decisions in a
`## Human Decisions` section, each tagged `before-planning` or
`before-implementation`; `/prd-auto-implement` surfaces the questions to you
and records your answers back in the issue. `AFK` issues proceed without
asking. The full run can take hours depending on the number of issues. See
the [Slash Command Reference](./docs/reference/commands.md#auto-implement)
for the orchestration details.

## Honorable Mentions

- [ascii-gif](https://github.com/tamnd/ascii-gif) — used to generate the
  demo GIF in this README.
- [spec-kit](https://github.com/github/spec-kit) — this project was
  originally inspired by GitHub's Spec Kit, but is essentially a simplified
  version of it.

## Documentation

- [Install CLI Reference](./docs/reference/install-cli.md) — wizard flags,
  config discovery, plugin entry forms, and model recommendations.
- [Slash Command Reference](./docs/reference/commands.md) — every command,
  its artifacts, and the revision loops.
- [AGENTS.md](./AGENTS.md) — code guidelines, project structure, and the
  plugin surface contract.
- [DEVELOPMENT.md](./DEVELOPMENT.md) — build and debug guide.
- [CHANGELOG.md](./CHANGELOG.md) — release history.
- [`docs/e2e.md`](./docs/e2e.md) — how the mock-LLM e2e suite works,
  including the template-rewriting mechanism.
- [`qa/README.md`](./qa/README.md) — the manual QA suite that drives the
  plugin against real frontier models.
