# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `opencode-sdd` CLI binary with `install` subcommand and `--help`.
- `opencode-sdd install` — interactive setup wizard. Discovers
  patchable opencode config files, spawns a headless opencode server
  to enumerate reachable models, recommends a model per SDD subagent
  (cheap tier for read-only researchers, strong tier for writers),
  shows a unified diff preview, and writes the patch atomically with
  comment and key-order preservation for `.json` and `.jsonc`.
- `opencode-sdd install --yes` (or `-y`) — non-interactive mode:
  resolves the default target, auto-selects recommended models,
  skips the confirmation gate, and prints the path + diff to stdout.
  Exits non-zero when no resolvable target is found (never
  auto-creates).
- `opencode-sdd install` create-new fallback — offers to create
  `<cwd>/opencode.json` when discovery finds no existing config in
  the interactive flow; re-runs are idempotent.
- `opencode-sdd install` graceful degradation — a probe failure
  (server won't start, no models reachable) still registers the
  plugin entry, writes no model values, emits a warning to stderr,
  and exits 0 (success-with-warning).
- Manual QA suite now runs the SDD/PRD flows on real frontier models:
  the local llama.cpp LLM is replaced by a bifrost gateway with the
  OpenRouter provider (pinned model allowlist plus request tracing), so
  the plan tests artifact and prompt quality and can be re-run under a
  different model (`BIFROST_MODEL`).
- OpenRouter key handling for the QA stack is human-gated: the key is
  resolved from the gitignored `qa/.env`, the environment, an external
  key file, or an interactive hidden prompt and never committed or
  logged (`qa/scripts/setup/lib-openrouter-key.sh`,
  `qa/docker/bifrost-provision.sh`).
- Bifrost request logging lets QA inspect exactly what requests hit the
  model (prompts, responses, tokens, cost, latency) via `/api/logs` or
  the gateway's Web UI.
- Manual QA plans are now Gherkin feature files (`qa/features/`) with a
  `@TC-<GROUP>-<case>` ID convention and priority tags, plus an
  interactive runner (`pnpm qa:run`) that records pass/fail/skip
  verdicts with notes into `qa/output/<run-id>/report.md` (and
  `.json`). Plans are linted as code via `pnpm lint:gherkin` (ID check +
  `gherkin-lint`), chained into `pnpm lint`.
- `qa-test-planning` and `manual-test-run` skills (`.agents/skills/`)
  drive the manual QA workflow: building a coverage matrix and a curated
  A/B case list for a changeset, then executing and recording the run.

### Changed

- Upgraded the pinned opencode versions to 1.18.23:
  `@opencode-ai/sdk` and `@opencode-ai/plugin` (npm), and the
  `opencode` binary in CI, the CI Dockerfile, and the QA workspace
  image (`OPENCODE_VERSION` build arg).
- The QA stack (`qa/docker-compose.yml`) no longer serves
  inclusionAI/Ling-3.0-tiny via llama.cpp: `maximhq/bifrost:v1.6.11`
  plus the `openrouter` provider (allowlist in `qa/bifrost/models.tsv`)
  replaces it; the workspace now waits on the gateway's health instead
  of a container-level healthcheck.
- The manual QA plans moved from `qa/testplan/` (Markdown, manual
  record sheets) to Gherkin feature files in `qa/features/`, with the
  test plan's structure and running sections now in `qa/README.md`.
- The QA suite's scripts are reorganized: host-side lifecycle wrappers
  (stack/gateway start & stop, prerequisite check, key contract) live in
  `qa/scripts/setup/` and the in-container scripts (bifrost
  provisioning, scratch project, opencode config wiring, smoke test) in
  `qa/docker/` — all baked into the workspace image at `/app/qa/docker/`.
- The QA OpenRouter key now defaults to the gitignored `qa/.env` file
  (template `qa/.env.example`), read by both docker compose and the
  start scripts; the exported env var, an external key file, and the
  interactive hidden prompt remain as alternatives (see
  `qa/scripts/setup/lib-openrouter-key.sh`, `qa/docker/bifrost-provision.sh`).

### Fixed

- The `sdd-command` tool is now actually gated at runtime: denied
  globally via `permission`, allowed for SDD workers, and explicitly
  denied for other agents (requires opencode 1.18.23+).

## [v1.2.1] - 2026-07-03

### Fixed

- Plugin silently failed to load from npm: a leaked runtime `tool` import
  from `@opencode-ai/plugin` (a type-only devDependency) in
  `src/sdd-command/definition.ts` survived into `build/`, so Node threw
  `ERR_MODULE_NOT_FOUND` on import before the `config` hook ran. Replaced the
  `tool()` call with a plain `ToolDefinition` literal (JSON Schema `args`),
  restoring the zero-runtime-imports invariant. Masked by `file://` loading;
  only npm installs were affected.

### Changed

- `pnpm build` now runs `scripts/check-runtime-imports.mjs`, which fails if
  any compiled `build/` module imports from `@opencode-ai/*` (type-only
  devDependencies), preventing regressions of the issue above.

## [v1.2.0] - 2026-07-03

### Added

- `prd-auto-implement` command: orchestrates the full PRD implementation
  pipeline on `sdd-build`, with prerequisite hard-stops and optimistic-path
  per-issue dispatch of the `sdd-planner`, `sdd-reviewer`, `sdd-coder`, and
  `sdd-validator` workers.
- The `config` hook now grants `external_directory` read access to the
  bundled templates directory (`<abs-templates-dir>/**` -> `"allow"`), so
  SDD workers reading template files via the `read` tool are no longer
  gated behind a permission prompt. Spread-merged onto existing user
  permissions without loosening a global deny/ask posture.

### Changed

- `prd-implement-issue` and `sdd-implement` commands instruct the
  implementer not to embed spec-internal IDs (success criteria, user stories,
  issues, acceptance criteria, tasks) into shipped code, comments, or commit
  messages; the gitignored spec artifacts' `[x]` markers already track the
  spec-to-code mapping.
- E2E suite (`vitest.test-e2e.config.ts`): raised the per-test and per-hook
  timeouts from 120s to 240s, and disabled file parallelism on Windows, so
  cold opencode server starts on a loaded Windows CI runner no longer time
  out the first command.

## [v1.1.0] - 2026-06-24

### Added

- `/prd-review-plan` command — optional plan review step that evaluates a
  plan across six dimensions and produces a review report with an
  Approved/Needs Revision verdict.
- Plan revision loop: `prd-issue-to-plan` and `prd-implement-issue` now
  read prior reviews and validations, allowing iterative revision cycles.
- `REVISED` overall status added to validation reports for signaling
  revised implementations awaiting re-validation.
- `Resolved:` field on validation report issues so `prd-implement-issue`
  can mark how each prior failure was addressed.

### Changed

- All command files now use `{SPECS_DIR}` syntax instead of bare
  `SPECS_DIR/` placeholder references.
- Command input sections migrated from `$ARGUMENTS` extraction to a
  structured `User input: $ARGUMENTS` pattern.
- `prd-validate-issue` now supports re-validation by reading prior
  validation reports and carrying unresolved issues forward.
- New issue statuses added to status transitions across the PRD flow:
  "Approved", "Reviewing", "Needs Revision", "Revised", "REVISED".
- README updated to document the 7-step PRD long flow with plan review
  and implementation validation loops.
- AGENTS.md updated with `prd-review-plan` entries in Project Structure
  and a CHANGELOG contribution rule.

## [v1.0.0] - 2026-06-24

### Changed

- Improved the documentation

## [v0.2.0] - 2026-06-23

### Added

- SDD short flow: `/sdd-spec`, `/sdd-implement`, and `/sdd-validate` commands
  for lightweight plan → implement → validate cycles in a single session.
- PRD long flow: six isolated-session commands (`/prd-write`,
  `/prd-to-issues`, `/prd-issue-to-plan`, `/prd-implement-issue`,
  `/prd-validate-issue`, `/prd-validate`) that drive a feature from vague
  description through validated implementation.
- Documentation maintenance commands (`/doc-readme`, `/doc-development`,
  `/doc-deployment`, `/doc-agents`, `/doc-changelog`) that keep project
  docs synchronized with the codebase.
- `sdd-orchestrator` agent for coordinating multi-step PRD flow sessions.
- Markdown frontmatter parser for extracting metadata from command
  definition files.
- Command loader that scans bundled Markdown command files at startup.
- Template rewriter that resolves portable `@opencode-sdd-templates/`
  references to absolute filesystem paths at registration time.
- Structured logging via the opencode client app log.
- Docker-based CI pipeline with multi-stage build (lint, typecheck, test,
  e2e).
- E2E test suite with a deterministic, offline mock OpenAI-compatible LLM
  server.
- Husky pre-commit hook running the full `pnpm check` gate.

[unreleased]: https://github.com/ameshkov/opencode-sdd/compare/v1.2.1...HEAD
[v1.2.1]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.2.1
[v1.2.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.2.0
[v1.1.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.1.0
[v1.0.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.0.0
[v0.2.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v0.2.0
