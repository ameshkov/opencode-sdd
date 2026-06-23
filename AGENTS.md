# AGENTS.md

opencode-sdd — a Specification-Driven Development plugin for
[OpenCode](https://opencode.ai). You describe what you want in vague terms;
the plugin produces a complete, validated development plan — PRDs, issues,
implementation plans, and validation reports — with every phase running in a
clean, isolated session.

## Table of Contents

- [Project Overview](#project-overview)
- [Technical Context](#technical-context)
- [Project Structure](#project-structure)
- [Build and Test Commands](#build-and-test-commands)
- [Contribution Instructions](#contribution-instructions)
- [Code Guidelines](#code-guidelines)
    - [Architecture](#architecture)
    - [Plugin Surface](#plugin-surface)
    - [Code Quality](#code-quality)
    - [Testing](#testing)
    - [Dependency Management](#dependency-management)
    - [Configuration & Documentation](#configuration--documentation)
    - [Markdown Formatting](#markdown-formatting)

## Project Overview

This repository builds an opencode plugin (`opencode-sdd`) that installs a
specification-driven development (SDD) workflow into opencode. The plugin is
loaded by opencode and extends its merged configuration with:

- **Agents** — an `sdd-orchestrator` coordinator (and, in later iterations,
  specialist agents it delegates to).
- **Commands** — slash commands such as `sdd-prd-write` that produce
  specification artifacts.

The plugin does not run as a standalone process. It is a module that exports a
default function of type `Plugin` from `@opencode-ai/plugin`, which returns a
`Hooks` object. Today the only hook is `config`, used to register agents and
commands.

## Technical Context

| Field | Value |
| --- | --- |
| Language | TypeScript 6, ES2022 target, strict mode |
| Runtime | Node.js 24+ (loaded inside the opencode host) |
| Package Manager | pnpm 10+ |
| Framework | OpenCode Plugin SDK (`@opencode-ai/plugin`, `@opencode-ai/sdk`) |
| Linting | ESLint 10.x + typescript-eslint |
| Formatting | Prettier 3.x, Markdownlint (markdownlint-cli2) |
| Unused-export analysis | Knip |
| Tests | Vitest 4.x |
| Project Type | opencode plugin (ESM, compiled to `build/`) |

## Project Structure

```text
opencode-sdd/
├── README.md                     # User-facing project pitch
├── DEVELOPMENT.md                # Build and debug guide for the plugin
├── Dockerfile                    # Multi-stage CI image (lint, test, e2e)
├── .dockerignore                 # Build-context exclusions for the Dockerfile
├── docs/                         # Long-form developer documentation
│   └── e2e.md                    # How the E2E test suite works and why
├── src/                          # Plugin source code
│   ├── index.ts                  # Plugin entry point; returns Hooks
│   ├── index.test.ts             # Unit tests for the plugin entry point
│   ├── commands/                 # Command definitions CODE (loader, parser, rewriter)
│   │   ├── index.ts              # Barrel exports (public API)
│   │   ├── frontmatter-parser.ts # Markdown frontmatter parser for command files
│   │   ├── frontmatter-parser.test.ts  # Unit tests for the frontmatter parser
│   │   ├── loader.ts             # Scans directory for *.md, parses, returns map
│   │   ├── loader.test.ts        # Unit tests for the command loader
│   │   ├── markdown.test.ts      # Wiring regression test for shipped commands
│   │   ├── template-rewriter.ts  # Rewrites @opencode-sdd-templates/ to abs path
│   │   └── template-rewriter.test.ts # Unit tests for the template rewriter
│   ├── assets/                   # Bundled command and template data
│   │   └── commands/             # Command Markdown files + referenced templates
│   │       ├── prd-write.md      # prd-write command (PRD writer)
│   │       ├── prd-to-issues.md  # prd-to-issues command (PRD -> issues)
│   │       ├── prd-issue-to-plan.md   # prd-issue-to-plan command (issue -> plan)
│   │       ├── prd-implement-issue.md # prd-implement-issue command (run a plan)
│   │       ├── prd-validate-issue.md  # prd-validate-issue command (per-issue validation)
│   │       ├── prd-validate.md   # prd-validate command (cross-cutting validation)
│   │       ├── sdd-implement.md  # sdd-implement command (spec + plan runner)
│   │       ├── sdd-spec.md  # sdd-spec command (spec writer)
│   │       ├── sdd-validate.md   # sdd-validate command (quick validation)
│   │       ├── doc-agents.md        # doc-agents command (AGENTS.md actualizer)
│   │       ├── doc-changelog.md     # doc-changelog command (CHANGELOG.md maintainer)
│   │       ├── doc-deployment.md    # doc-deployment command (DEPLOYMENT.md actualizer)
│   │       ├── doc-development.md   # doc-development command (DEVELOPMENT.md actualizer)
│   │       ├── doc-readme.md        # doc-readme command (README.md actualizer)
│   │       └── templates/           # Template assets referenced by commands
│   │           ├── doc-agents/           # AGENTS.md templates
│   │           │   ├── contribution-instructions-example.md
│   │           │   ├── architecture-example.md
│   │           │   ├── markdown-formatting-rules.md
│   │           │   └── system-design-*.md
│   │           ├── doc-readme/           # README templates
│   │           │   └── readme-*.md
│   │           ├── prd-issue-to-plan/    # Plan template
│   │           │   └── plan-template.md
│   │           ├── prd-validate/         # Cross-cutting validation template
│   │           │   └── validation-report-template.md
│   │           ├── prd-validate-issue/   # Per-issue validation template
│   │           │   └── validation-report-template.md
│   │           ├── prd-write/            # PRD template
│   │           │   └── prd-template.md
│   │           ├── sdd-spec/        # Spec templates
│   │           │   ├── plan-template.md
│   │           │   └── task-structure-template.md
│   │           └── sdd-validate/         # Validation template
│   │               └── validation-report-template.md
│   └── utils/                    # Shared internal utilities
│       ├── index.ts              # Barrel exports (public API): Logger, createLogger
│       ├── logger.ts             # Plugin logger (opencode client.app.log)
│       └── logger.test.ts        # Unit tests for the logger
├── scripts/                      # Build-time helper scripts
│   └── copy-assets.mjs           # Copies src/assets/ into build/assets/
├── test/                         # Shared test support code (not test cases)
│   ├── __fixtures__/             # Loader test fixtures (ignored by markdownlint)
│   └── stub-client.ts            # Stub opencode SDK client for tests
├── test-e2e/                     # Mock-LLM e2e suite (runs via pnpm test:e2e)
│   ├── harness.ts                # Binary/build guards, server lifecycle, session helpers
│   ├── harness.test.ts           # Unit tests for harness env isolation helpers
│   ├── mock-server.ts            # node:http OpenAI-compatible SSE mock LLM
│   ├── mock-server-chunks.ts     # SSE chunk builders for the mock
│   ├── mock-server.test.ts       # Standalone unit test for the mock
│   ├── scenarios.ts              # writeFileScenario / writeFilesScenario builders
│   ├── smoke.e2e.test.ts         # Commands register in a live opencode server
│   ├── command.e2e.test.ts       # Mock-LLM-driven command -> file on disk
│   └── global-setup.ts           # Vitest globalSetup: binary + build guards
├── .husky/
│   └── pre-commit                # Runs pnpm check before every commit
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions: checks, cross-platform e2e, releases
├── eslint.config.mjs             # ESLint flat config
├── knip.config.ts                # Knip unused-export analysis config
├── tsconfig.json                 # Shared TypeScript config (base; editor)
├── tsconfig.build.json           # Production build config (excludes tests)
├── tsconfig.test.json            # Test typecheck config (noEmit)
├── vitest.config.ts              # Vitest configuration (excludes *.e2e.test.ts)
├── vitest.test-e2e.config.ts     # Vitest configuration for the e2e suite
└── package.json                  # Project dependencies and scripts
```

## Build and Test Commands

- `pnpm build` — compile TypeScript to `build/`
- `pnpm typecheck` — check for TypeScript type errors in production
  and test code
- `pnpm lint` — lint source files with ESLint and check for unused
  exports with Knip
- `pnpm lint:fix` — lint and auto-fix issues
- `pnpm knip` — run Knip unused-export analysis separately
- `pnpm format:check` — check formatting with Prettier and Markdownlint
- `pnpm format:fix` — fix formatting issues
- `pnpm check` — run `format:check`, `lint`, `typecheck`, and `test`
  (full CI gate)
- `pnpm test:e2e` — run the mock-LLM e2e suite against a real
  `opencode` server (NOT part of `pnpm check`; needs the `opencode`
  binary on PATH and a built `build/`)
- `pnpm clean` — remove `node_modules` and `build/`

## Contribution Instructions

You MUST follow the following rules for EVERY task that you perform:

- You MUST verify it with linter, formatter, and TypeScript compiler.

  Use the following commands:
    - `pnpm typecheck` to check for TypeScript type errors
    - `pnpm lint` to run the linter (ESLint) and Knip unused-export
      analysis
    - `pnpm lint:fix` to fix linting issues that can be fixed
      automatically
    - `pnpm format:check` to check the formatting (Prettier and Markdownlint)
    - `pnpm format:fix` to fix the formatting issues

- When making changes to the project structure, ensure the Project
  Structure section in `AGENTS.md` is updated and remains valid.

- If the prompt essentially asks you to refactor or improve existing code,
  check if you can phrase it as a code guideline. If it's possible, add it
  to the relevant Code Guidelines section in `AGENTS.md`.

- You MUST update the unit tests for changed code.

- You MUST run tests with the `pnpm test` script to verify that your
  changes do not break existing functionality.

- After completing the task you MUST verify that the code you've written
  follows the Code Guidelines in this file.

## Code Guidelines

### Architecture

Universal design principles this codebase follows:

- **Separation of Concerns** — each module handles one aspect of the
  system (e.g., `commands/` for command definitions).
- **Single Responsibility Principle** — every file, class, or function has
  one reason to change.
- **Dependency Direction** — dependencies point downward; never from lower
  layers to higher ones.
- **Explicit Boundaries** — module interfaces are intentional; barrel
  `index.ts` files define public API. External code MUST import from
  barrel files only. Each directory groups related functionality and
  imports only from layers below it.
- **Minimize Coupling, Maximize Cohesion** — modules are self-contained
  and interact through narrow interfaces.
- **Make Invalid States Impossible** — use TypeScript strict mode and
  validation to prevent illegal combinations at compile time.
- **Keep It Boring** — prefer well-understood patterns over clever or
  novel solutions.

The project's layers, from top to bottom:

- **Entry point** (`src/index.ts`) — exports the `Plugin` function,
  returns the `Hooks` object, and wires together the registered surface.
- **Definitions** (`src/commands/`) — Markdown command files loaded at
  startup via the loader, plus the frontmatter parser and the template
  rewriter that rewrites the portable `@opencode-sdd-templates/` token to
  the resolved absolute templates directory at registration time. No side
  effects beyond logging.
- **Data** (`src/assets/commands/` + `src/assets/commands/templates/`) —
  Bundled command Markdown files and prompt template assets embedded by
  command prompts via native `@<abs-path>` mention resolution.

```text
Entry point (index.ts)
      ↓
Definitions (commands/)
      ↓
Data (assets/commands/, assets/commands/templates/)
```

Definitions MUST NOT import from the entry point. New layers (e.g.,
services, utilities) introduced in later iterations MUST sit below the
entry point and above definitions only when they are consumed by them.

### Plugin Surface

This plugin talks to opencode exclusively through the `config` hook:

- **Registering agents and commands is a config-hook concern.** The
  `config` hook receives opencode's live merged `Config` object and mutates
  it in place. Agents go under `config.agent`; commands go under
  `config.command`.
- **Never overwrite existing user configuration.** Always spread-merge so
  the plugin adds its entries without clobbering keys the user already
  defined: `config.agent = { ...config.agent, <key>: <value> }`.
- **Rewriting template asset mentions is a config-hook concern.**
  Command Markdown files embed bundled template assets using the portable
  token `@opencode-sdd-templates/<subdir>/<file>.md` (environment-
  independent, baked into source). The absolute assets directory is only
  known at runtime (`resolveTemplatesDir()` in `src/index.ts`), so the
  `config` hook rewrites each loaded command template at registration
  time, replacing `@opencode-sdd-templates/` with `@<abs-templates-dir>/`
  via `rewriteAssetReferences`. opencode's `resolvePromptParts` then
  inlines the file via the `read` tool with `bypassCwdCheck: true`, so
  bundled assets outside the worktree need no `external_directory`
  permission.
- **Command shape:** `{ template: string, description?: string, agent?:
  string, model?: string, subtask?: boolean }`. `template` is required and
  is the prompt body; `$ARGUMENTS` is interpolated with the user's input.
- **Agent shape:** `{ description?: string, mode?: 'subagent' | 'primary'
  | 'all', prompt?: string, model?: string, ... }`. The orchestrator is a
  `subagent` so it coexists with opencode's built-in agents.
- **Type the surface against the SDK.** Import `AgentConfig` from
  `@opencode-ai/sdk` and derive command types from `Config` so the
  compiler catches shape mistakes early. opencode hard-fails on invalid
  config, so the cost of a wrong shape is a broken startup.
- **The plugin must not throw during load.** Keep the `config` hook
  deterministic; if registration of a feature fails, degrade gracefully
  rather than breaking opencode startup.

### Code Quality

All code MUST meet documentation and style requirements before merge:

- **Public API documentation**: Exported functions, classes, interfaces,
  and their properties MUST have JSDoc comments describing purpose,
  arguments, return values, and thrown errors (use `@throws` only for
  specific errors).
- **Static analysis gates**: Every change MUST pass TypeScript compilation
  (`pnpm typecheck`), ESLint (`pnpm lint`), and Prettier/Markdownlint
  (`pnpm format:check`) before merge.
- **Do not modify linter or formatter configurations**: Never change
  ESLint, Prettier, Markdownlint, or TypeScript configuration files
  (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`,
  `.markdownlint-cli2.yaml`, `tsconfig.json`, `tsconfig.build.json`)
  to work around lint or formatting errors. Fix the source code instead.
  If the issue cannot be resolved after a few attempts, ask the human for
  help. Legitimate structural edits to these files (for example, the
  base/build/test tsconfig split) are not "workarounds" and are allowed.
- **Error handling strategy**: Prefer throwing errors over returning error
  values. Handle errors at top-level entry points where they can be logged.
- **File naming**: Use kebab-case for all file names. TypeScript source
  files MUST use lower-case kebab-case. Do NOT use PascalCase or camelCase
  file names.
- **ESM import specifiers**: The project targets `module: Node16`. Relative
  imports MUST include the `.js` extension (e.g., `./agents/index.js`),
  even though the source is `.ts`.
- **Knip unused-export analysis**: The project uses Knip
  (`knip.config.ts`) to detect unused exports. All Knip findings MUST
  be resolved — either remove the unused export or, when the export is
  genuinely needed but not reachable through the public dependency
  graph, mark it with the JSDoc `@internal` tag. The `@internal` tag
  is allowed **only** when a symbol is exported solely for test files
  and is intentionally **not** re-exported from the module barrel.
  Every `@internal` tag MUST include a short explanation of why the
  export is excluded (e.g., "Exported for tests only; not part of the
  public module API"). Do NOT use `@internal` to silence legitimate
  unused-export warnings — remove the export instead.
- **File size limit**: Source files SHOULD stay within 300 lines of code.
  When a file approaches or exceeds this limit — or fails the ESLint
  `max-lines` gate (300 lines) — your FIRST and default response MUST be
  to **split the file into several smaller, cohesive files**, each with a
  single, clear responsibility (extract related functions, types, or
  constants into dedicated modules, and re-export them through the
  barrel). Treat the limit as a signal that the file is doing too much,
  not as a quota to optimize against. You MUST attempt a split before any
  other tactic; only fall back if you can articulate a concrete reason a
  split would hurt clarity. For test files, split a large `*.test.ts`
  into multiple focused `*.test.ts` files grouped by the behavior they
  verify — multiple test files per source module are explicitly allowed.
  **Do NOT** satisfy the limit by making the existing code shorter: no
  condensing tests into table-driven blocks purely to save lines, no
  shortening of identifiers, string literals, or file paths, no merging
  statements onto one line, and no removing blank lines, comments, or
  JSDoc. Formatting is managed by Prettier and must stay uniform —
  readability and clarity always win over line count.
  Exceptions: auto-generated files.
- **Function size limit**: Functions SHOULD stay within 50 lines of code.
  When approaching or exceeding this limit, break the function into
  smaller, named helper functions with single, clear responsibilities.
  **Do NOT** condense logic into dense one-liners, inline multiple
  statements on a single line, or strip whitespace to fit the limit —
  formatting is managed by Prettier and must not be sacrificed for
  brevity.
  Exceptions: auto-generated files.

**Rationale**: Consistent documentation and tooling enforcement prevents
technical debt accumulation and ensures codebase navigability.

### Testing

Every module MUST have test coverage:

- **Test file placement**: Test files are co-located with their source
  files in `src/` and MUST use the `.test.ts` suffix (e.g.,
  `src/index.test.ts` next to `src/index.ts`).
- **Shared test utilities**: Common test infrastructure lives in the
  `test/` directory. These files MUST NOT use the `.test.ts` suffix — they
  are test support code, not test cases.
- **Test verification mandatory**: All changes MUST pass `pnpm test`
  before merge. Tests MUST NOT be deleted or weakened without explicit
  justification.
- **Prefer real behavior over mocks**: The plugin entry is exercised by
  calling it and asserting on the `config` hook's effect on a `Config`
  object, not by mocking opencode internals.

**Rationale**: Co-locating tests with source keeps related files close,
making it easier to find, update, and maintain tests.

#### E2E Testing

The `test-e2e/` suite exercises the plugin against a real `opencode` server
(opencode-as-a-library), driven by a local mock OpenAI-compatible LLM
(`node:http` + SSE). It is deterministic, offline, and needs no API keys:

- **Prerequisites**: the `opencode` binary on PATH **and** a built `build/`
  (the plugin loads from `build/index.js` via `file://`). The vitest
  `globalSetup` (`test-e2e/global-setup.ts`) fails loudly with a clear message
  if either is missing.
- **Scope**: `pnpm test:e2e` runs the standalone mock unit test plus the
  binary-dependent `.e2e.test.ts` files. It is intentionally **not** part of
  `pnpm check`; the main `vitest.config.ts` excludes `*.e2e.test.ts` so the CI
  gate never requires the binary. The mock unit test
  (`test-e2e/mock-server.test.ts`) still runs under `pnpm test`.
- **Type checking**: `test-e2e/**/*` is included in `tsconfig.json`, so
  `pnpm typecheck` covers it; it is never compiled into `build/`.
- **How it works**: see [`docs/e2e.md`](docs/e2e.md) for how the suite
  operates — the mock LLM, server lifecycle, permission auto-approve, and
  the runtime absolute-path template-rewriting mechanism (which replaced
  the broken reference-registration approach).

### Dependency Management

- **Pin all dependency versions explicitly**: Do not use `^` or `~` in
  `package.json`.
- **Type-only dependencies are devDependencies**: The OpenCode Plugin and
  SDK packages are imported only for types (erased at compile time), so
  they live in `devDependencies`. The compiled output has no runtime
  imports — verify this after structural changes.

External dependencies MUST be carefully evaluated before adoption:

- **Prefer vanilla solutions**: Use Node.js built-in APIs and standard
  language features when they adequately solve the problem. Only add a
  dependency when it provides significant value over a vanilla
  implementation.
- **Reputable sources only**: Dependencies MUST come from
  well-established, actively maintained projects. Evaluate by: weekly
  downloads (prefer >100k), GitHub stars, recent commit activity, and
  known maintainers.
- **Avoid unpopular libraries**: Do NOT add niche or obscure packages
  with limited community adoption. These pose security risks and may
  become unmaintained.
- **Minimize dependency count**: Each new dependency increases attack
  surface, bundle size, and maintenance burden. Justify every addition.
- **Use the latest stable version**: When adding a new dependency,
  explicitly check the package registry for the latest stable release and
  use it. Do not copy outdated version numbers from memory, training
  data, or existing lock files of other projects.

**Rationale**: Fewer, well-vetted dependencies reduce security
vulnerabilities, supply chain risks, and long-term maintenance costs.

### Configuration & Documentation

Configuration and documentation MUST stay synchronized with code:

- **Documentation updates required**: Changes to build process, plugin
  surface, or configuration MUST update relevant documentation.
- **Structure tracking**: Changes to project structure MUST update the
  Project Structure section in `AGENTS.md`.
- **TypeScript project structure**: The project uses a base/build/test
  tsconfig split. `tsconfig.json` is the shared base and the config the
  editor keys off; it includes production source and tests and sets
  `types: ["node"]`, so every file (including `*.test.ts`) resolves Node
  built-ins like `node:url` in the editor. `tsconfig.build.json` extends
  the base, adds `outDir`/`rootDir`, and excludes tests for the compiled
  `build/` output. `tsconfig.test.json` extends the base with `noEmit`
  for the typecheck gate. Do NOT exclude `*.test.ts` from `tsconfig.json`:
  doing so makes the editor treat test files as orphans and report false
  `Cannot find name 'node:*'` errors that `pnpm typecheck` does not
  reproduce.

**Rationale**: Stale documentation causes onboarding friction and
operational incidents.

### Markdown Formatting

All Markdown files MUST follow these formatting rules:

- **Line length**: Keep lines at most 80 characters. This is not a hard
  lint gate, but SHOULD be followed for readability. Lines inside fenced
  code blocks are exempt from this limit.
- **Unordered lists**: Use dashes (`-`) for bullet points. Indent nested
  list items by 4 spaces.
- **Emphasis**: Use asterisks (`*`) for emphasis (`*italic*`,
  `**bold**`). Do NOT use underscores.
- **Headings**: Duplicate heading names are allowed only among sibling
  headings (same parent level). Avoid duplicates across different levels.
- **Inline HTML**: Avoid raw HTML in Markdown. The only allowed elements
  are `<a>`, `<p>`, `<details>`, `<summary>`, and `<img>`.
- **Trailing spaces**: Do NOT leave trailing whitespace on any line. Do
  NOT use two-space line breaks — use a blank line instead.
- **Bare URLs**: Bare URLs are permitted and do not need to be wrapped
  in angle brackets.
- **Table formatting**: Align table columns with padding when the table
  fits within 80 characters. If the table exceeds 80 characters or
  triggers an MD060 linter warning, switch to a compact format using
  single spaces only. This applies to the separator row as well — it
  should be written as `| --- |`, not `|--|`.

  Example of correct layout:

  ```markdown
  | Col1 | Col2 |
  | --- | --- |
  | Value1 | Value2 |
  ```

  Do NOT use extra padding or alignment characters beyond single spaces.

**Rationale**: Uniform Markdown formatting improves readability for both
humans and AI agents that consume project documentation.
