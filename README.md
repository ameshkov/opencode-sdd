# opencode-sdd

[![CI](https://github.com/ameshkov/opencode-sdd/actions/workflows/ci.yml/badge.svg)](https://github.com/ameshkov/opencode-sdd/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/opencode-sdd)](https://www.npmjs.com/package/opencode-sdd)
[![GitHub release](https://img.shields.io/github/v/release/ameshkov/opencode-sdd)](https://github.com/ameshkov/opencode-sdd/releases)

**Specification-Driven Development for OpenCode.**

You describe what you want in vague terms.
The plugin produces a complete, validated development plan — PRD, issues,
implementation plans, and validation reports — with every phase running in a
clean, isolated session.

## The Problem

AI coding agents are great at writing code.
They’re terrible at *planning* code.

You tell an agent “build a payment system” and it starts typing.
No requirements. No architecture.
No validation. By the time you realize it built the wrong thing, you’ve burned a
session full of context and a pile of tokens.

Manually writing PRDs and breaking down issues is slow.
Chaining prompts across sessions is fragile.
And every time you paste the previous step’s output into a new conversation,
something gets lost.

## The Solution

**opencode-sdd** inverts the workflow: *plan everything before you build
anything.*

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

`SPECS_DIR` defaults to `.sdd/.current/`.

## The PRD Long Flow

For a larger feature, drive requirements through validated implementation in
six steps. Each step runs in a clean session and produces the next artifact.

1. Write a product spec from a feature description.
2. Break the spec into independent vertical-slice issues.
3. Plan a single issue.
4. Implement that issue's plan.
5. Validate that issue against its plan.
6. Cross-validate every implemented issue.

- `/prd-write` — produce `SPECS_DIR/prd.md` from a feature description.
- `/prd-to-issues` — write vertical-slice issues under `SPECS_DIR/issues/`.
- `/prd-issue-to-plan` — write a plan for one issue.
- `/prd-implement-issue` — run one issue's plan.
- `/prd-validate-issue` — validate one issue against its plan.
- `/prd-validate` — cross-validate all implemented issues and write
  `SPECS_DIR/validation.md`.

## Keeping Documentation Current

The `doc-*` commands update the project's standard documentation files to
match the codebase. Run them after a change that affects the corresponding
file.

- `/doc-readme` — update `README.md` to stay a user manual.
- `/doc-development` — update `DEVELOPMENT.md` (build and debug guide).
- `/doc-deployment` — update `DEPLOYMENT.md`.
- `/doc-agents` — update `AGENTS.md` (guidelines and project structure).
- `/doc-changelog` — add the Unreleased entry to `CHANGELOG.md`.

## Testing

The plugin has two Vitest suites:

- **Unit tests** (`pnpm test`, part of `pnpm check`) — fast, no external
  dependencies; assert command loading and reference resolution in memory.
- **E2E tests** (`pnpm test:e2e`, **not** part of `pnpm check`) — spin up a
  real `opencode` server with the plugin loaded, route its model at a local
  mock LLM, run SDD commands, and assert on files written to disk.
  Deterministic, offline, and free (no API keys). Requires the `opencode`
  binary on PATH and a built `build/` (`pnpm build`). See
  [DEVELOPMENT.md](./DEVELOPMENT.md) and [docs/e2e.md](./docs/e2e.md) for
  details.
