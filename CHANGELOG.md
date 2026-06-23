# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/ameshkov/opencode-sdd/compare/v0.2.0...HEAD
[v0.2.0]: https://github.com/ameshkov/opencode-sdd/releases/tag/v0.2.0
