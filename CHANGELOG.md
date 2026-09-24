# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- opencode 2.x support: the plugin's default export is now a dual entry
  (`{ id, server, setup }`) that registers the full SDD surface —
  commands, agents, the `sdd-command` tool, and permission gating — on
  opencode 2.0.x as well as 1.x.
- The install wizard detects the opencode host line and writes native
  configuration: `plugins`/`agents` on 2.x, `plugin`/`agent` on 1.x. It
  refuses opencode 1.x below 1.18.29 with an upgrade hint.

### Changed

- `--local` plugin entries point at `<path>/build` on opencode 2.x (V2
  resolves `<dir>/index.js` and ignores `package.json#main`); on 1.x the
  entry still points at the package root.
- On opencode 2.x the plugin inlines command template assets itself,
  because V2 does not inline `@<abs-path>` prompt mentions.

## [v1.5.0] - 2026-09-22

### Added

- `opencode-sdd` CLI: `--version` flag prints the running package
  version (e.g. `opencode-sdd 1.4.0`) and exits, without running the
  install wizard.

### Changed

- Removed the five `/doc-*` documentation-maintenance commands
  (`/doc-readme`, `/doc-development`, `/doc-deployment`, `/doc-agents`,
  `/doc-changelog`) and their bundled templates.

## [v1.4.0] - 2026-09-09

### Changed

- Install wizard recommendation keywords: every SDD agent now prefers
  `deepseek` first. The four strong agents additionally rank `kimi`
  (right after `deepseek`), `qwen`, `opus` and `gpt`; the two read-only
  researchers now prefer `deepseek`/`qwen` instead of `mimo`/`gemini`.
- `prd-implement-issue`, `sdd-implement`, `sdd-spec`, and `prd-issue-to-plan`
  now explicitly instruct that code comments must not reference the PRD, the
  spec, or the implementation plan, and must not embed their internal IDs
  (success criteria, acceptance criteria, issue/task IDs) in comments,
  identifiers, or test names.

## [v1.3.0] - 2026-09-07

### Added

- `opencode-sdd` CLI: `install` wizard (`--yes`, `--help`) that finds a
  patchable opencode config, probes reachable models and recommends one
  per SDD agent, shows a diff preview, and writes the patch atomically.
- `install --tag <spec>` and `--local [path]`: pin an npm dist-tag or
  version, or register a local build directory; prerelease builds
  self-pin the `canary` tag and pinned entries are never silently reset.
- Canary releases: every `master` push publishes `<version>-canary.<sha>`
  to the `canary` npm dist-tag (`npx opencode-sdd@canary`).

### Changed

- `sdd-build` orchestrator removed: `/prd-auto-implement` now runs under
  whichever agent invokes it.
- `prd-implement-issue` and `sdd-implement` require checking the
  `### [ ] Task N:` heading markers and verify them before finishing.
- `doc-changelog` omits R&D-only changes, keeping the Unreleased section
  user-facing only.
- Pinned opencode to 1.18.29 (`@opencode-ai/sdk`, `@opencode-ai/plugin`,
  binary).

### Fixed

- `sdd-command` is now actually gated: denied globally via `permission`,
  allowed for SDD workers, and explicitly denied to other agents
  (requires opencode 1.18.23+).
- On POSIX, `npx opencode-sdd@<tag>` no longer exits 0 without doing
  anything: the bin entry guard now resolves the npm `.bin` symlink.

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

[unreleased]: https://github.com/ameshkov/opencode-sdd/compare/v1.5.0...HEAD
[v1.5.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.5.0
[v1.4.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.4.0
[v1.3.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.3.0
[v1.2.1]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.2.1
[v1.2.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.2.0
[v1.1.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.1.0
[v1.0.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.0.0
[v0.2.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v0.2.0
