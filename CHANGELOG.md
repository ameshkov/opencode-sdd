# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- Add unreleased changes here -->

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

[unreleased]: https://github.com/ameshkov/opencode-sdd/compare/v1.1.0...HEAD
[v1.1.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.1.0
[v1.0.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v1.0.0
[v0.2.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v0.2.0
