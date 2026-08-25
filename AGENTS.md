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
    - [System Design](#system-design)
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

The repository has two entry points — a plugin entry point loaded by
opencode and a CLI entry point run as a bin — plus bundled asset data
and the usual build/test scaffolding. Only the top-level modules are
listed here; each module's barrel (`index.ts`) defines its public API
and the files inside it are self-explanatory from their names.

```text
opencode-sdd/
├── src/
│   ├── index.ts                # Plugin entry point (config + tool hooks)
│   ├── agents/                 # Agent loader: scans *.md → AgentConfig map
│   ├── commands/               # Command loader + template-rewriter
│   │                           # (rewrites @opencode-sdd-templates/ → abs path)
│   ├── sdd-command/            # The `sdd-command` custom tool (allowlist,
│   │                           # source loader, ToolDefinition factory)
│   ├── cli/                    # `opencode-sdd install` binary (second entry point)
│   ├── utils/                  # Shared internals: logger, frontmatter helpers
│   ├── assets/agents/          # Bundled agent Markdown (frontmatter + prompt)
│   ├── assets/commands/        # Bundled command Markdown files
│   └── assets/commands/templates/  # Prompt templates referenced by commands
│                              # via the @opencode-sdd-templates/ token
├── test/                       # Shared test support code (plugin-helpers,
│                               # stub-client, fixtures) — NOT test cases
├── test-e2e/                    # Mock-LLM end-to-end suite (real opencode
│                               # server driven by a local SSE mock LLM)
├── scripts/                    # Build-time helpers (copy-assets,
│                               # check-runtime-imports)
├── docs/                        # Long-form developer docs (e2e.md)
├── qa/                          # Manual QA suite: local LLM compose, the
│                               # isolated workspace image (Dockerfile:
│                               # opencode + toolchain, plugin baked in),
│                               # helper scripts, and the test plan
│                               # (qa/testplan/: README + plans/*.md)
├── README.md, DEVELOPMENT.md    # User-facing + build/debug guides
├── Dockerfile                   # Multi-stage CI image (lint, test, e2e)
├── eslint.config.mjs            # ESLint flat config
├── knip.config.ts               # Unused-export analysis config
├── tsconfig*.json               # Base / build / test TS config split
├── vitest*.config.ts            # Test + e2e Vitest configs
└── package.json                 # Dependencies and scripts
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

- When the coding task is finished update `CHANGELOG.md` in the
  Unreleased section. Add short, user-facing entries to the appropriate
  existing subsection (Added, Changed, or Fixed); do not create
  duplicate subsections or narrate implementation history. Internal
  refactors, dependency moves, test reorganisation, and doc-only edits
  are omitted.

## Code Guidelines

### System Design

Design for a library (an opencode plugin loaded inside the host process):

- The plugin is consumed by the opencode host — it MUST NOT throw during
  load and MUST NOT mutate global state (environment variables, process
  listeners, shared singletons) beyond what opencode's hook contract
  expects. The host may run alongside other plugins in a long-lived
  process.
- Export a stable public API: the default `Plugin` function from
  `@opencode-ai/plugin` returning a `Hooks` object. Internal modules
  (loaders, parsers, rewriters, utilities) are reached only through
  barrel `index.ts` files.
- Keep the dependency footprint minimal — the OpenCode Plugin and SDK
  packages are type-only (`devDependencies`, erased at compile time), so
  the compiled `build/` output has zero runtime imports. This is enforced
  by `scripts/check-runtime-imports.mjs` in `pnpm build` (fails the build
  on any leaked `@opencode-ai/*` value import); `import type { ... }` is
  the only correct form for these packages.
- Side effects are confined to the `config` hook: it mutates opencode's
  merged `Config` in place to register agents and commands. The only
  other side effect is filesystem reads of bundled asset Markdown at
  registration time, which is part of the plugin contract.
- Provide complete type definitions so the plugin is usable with static
  type checking against the SDK (`AgentConfig`, derived command types).
  opencode hard-fails on invalid config, so the compiler catches shape
  mistakes early.
- Handle errors by degrading gracefully inside the `config` hook — if a
  feature fails to register, log and continue rather than breaking
  opencode startup. Never let the hook throw.
- Keep the plugin deterministic: given the same `Config`, registration
  always produces the same result. No reliance on wall-clock time,
  network, or random values during load.

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
- **Data Flow Clarity** — data moves through the plugin in a single,
  traceable path: bundled Markdown → loader → frontmatter parser →
  template rewriter → registered `Config` entries. No hidden side
  channels.
- **Minimize Coupling, Maximize Cohesion** — modules are self-contained
  and interact through narrow interfaces.
- **Make Invalid States Impossible** — use TypeScript strict mode and
  validation to prevent illegal combinations at compile time.
- **Observability Built-in** — the plugin surfaces its behavior through
  the host's logger (`client.app.log` via `src/utils/logger.ts`); every
  registration step logs at an appropriate level so failures are
  diagnosable.
- **Keep It Boring** — prefer well-understood patterns over clever or
  novel solutions.

The project's layers, from top to bottom:

- **Entry point** (`src/index.ts`) — exports the `Plugin` function,
  returns the `Hooks` object, and wires together the registered surface.
- **Definitions** (`src/agents/`, `src/commands/`) — Markdown agent and
  command files loaded at startup via their loaders, plus their frontmatter
  parsers and the command template rewriter that rewrites the portable
  `@opencode-sdd-templates/` token to the resolved absolute templates
  directory at registration time. No side effects beyond logging.
- **Data** (`src/assets/agents/`, `src/assets/commands/` +
  `src/assets/commands/templates/`) — Bundled agent Markdown files,
  command Markdown files, and prompt template assets embedded by command
  prompts via native `@<abs-path>` mention resolution.

```text
Entry point (index.ts)
      ↓
Definitions (agents/, commands/)
      ↓
Data (assets/agents/, assets/commands/, assets/commands/templates/)
```

The project has **two entry points**, each compiling independently and
importing downward only:

1. **Plugin entry** (`src/index.ts`) — loaded by opencode inside the
   host process. Flow shown above.
2. **CLI entry** (`src/cli/install.ts`) — the `opencode-sdd` binary
   run by the user. Flow shown below.

Neither entry imports the other; the plugin entry never imports from
`src/cli/`, and the CLI never imports `src/index.ts`. This split keeps
the compiled plugin output (`build/index.js`) free of any runtime
`@opencode-ai/*` imports — such imports live only in the CLI graph
(`build/cli/`), enforced by `scripts/check-runtime-imports.mjs` in
`pnpm build`.

```text
CLI entry (src/cli/install.ts)
      ↓
CLI modules (src/cli/*.ts: argv, prerequisites, config-resolver,
            target-select, model-probe, recommend, yes-selection,
            interactive-selection, config-patcher, agent-model-*)
      ↓
User opencode config on disk (read + JSONC-safe patch + atomic write)
```

Definitions MUST NOT import from the entry point. Sibling definition
layers (`agents/`, `commands/`) MUST NOT import from each other; shared
parsing helpers live in the `utils/` layer below them. New layers (e.g.,
services, utilities) introduced in later iterations MUST sit below the
entry point and above definitions only when they are consumed by them.

### Plugin Surface

This plugin talks to opencode exclusively through the `config` hook:

- **Registering agents and commands is a config-hook concern.** The
  `config` hook receives opencode's live merged `Config` object and mutates
  it in place. Agents go under `config.agent`; commands go under
  `config.command`.
- **Never overwrite existing user configuration.** Always spread-merge at
  the top level so the plugin adds its entries without clobbering keys the
  user already defined: `config.agent = { ...config.agent, <key>: <value> }`.
  When the same entry already exists (`config.agent[<key>]` was user-set),
  also shallow-merge at the entry level — `{ ...existing, ...pluginConfig }`
  — so plugin-defined fields (`description`, `mode`, `permission`, `prompt`)
  take precedence while user-only fields the plugin never sets (notably
  `model`, e.g. from `opencode.json`) are preserved instead of clobbered.
  Commands are exempt: a colliding command is fully replaced (its
  `template` is the plugin's contract), and the overwrite is logged as a
  warning.
- **Rewriting template asset mentions is a config-hook concern.**
  Command Markdown files embed bundled template assets using the portable
  token `@opencode-sdd-templates/<subdir>/<file>.md` (environment-
  independent, baked into source). The absolute assets directory is only
  known at runtime (`resolveTemplatesDir()` in `src/index.ts`), so the
  `config` hook rewrites each loaded command template at registration
  time, replacing `@opencode-sdd-templates/` with `@<abs-templates-dir>/`
  via `rewriteAssetReferences`. opencode's `resolvePromptParts` inlines
  the file via the `read` tool with `bypassCwdCheck: true`, so the
  mention-inlining path itself needs no `external_directory` permission.
  As a defensive measure the hook ALSO grants `external_directory` read
  access to `<abs-templates-dir>/**` (spread-merged onto any existing
  `config.permission`, preserving other categories and path-glob rules,
  and never loosening a global `"deny"`/`"ask"` string into object form)
  so an SDD worker that reads a template file directly via the `read`
  tool is not gated behind a prompt. The grant is layered in
  `registerBundledTemplatesPermission` and verified by a live-config e2e
  test.
- **Command shape:** `{ template: string, description?: string, agent?:
  string, model?: string, subtask?: boolean }`. `template` is required and
  is the prompt body; `$ARGUMENTS` is interpolated with the user's input.
- **Agent shape:** `{ description?: string, mode?: 'subagent' | 'primary'
  | 'all', prompt?: string, model?: string, tools?: { [name: string]:
  boolean }, permission?: { read?, edit?, bash?, glob?, grep?, task?,
  websearch?, webfetch?, ... }, hidden?: boolean, ... }`. Agents are loaded
  from bundled Markdown+frontmatter assets under `src/assets/agents/`
  (mirroring the command loader); the file name (minus `.md`) becomes the
  agent name, frontmatter becomes the `AgentConfig` fields, and the Markdown
  body becomes `prompt`. `hidden: true` hides a `subagent` from the Tab
  switcher. The orchestrator is a `subagent` so it coexists with opencode's
  built-in agents.
- **Prefer `permission` over the deprecated `tools` field.** opencode
  marks `tools` as deprecated in favour of `permission` for finer-grained
  control, and opencode ignores `tools` for plugin-registered tools. All
  shipped agents gate the `sdd-command` custom tool with `permission`:
  the `config` hook denies it globally
  (`config.permission['sdd-command'] = 'deny'`, spread-merged like the
  templates grant), worker frontmatters allow it per-agent
  (`permission: { sdd-command: allow }`), and non-worker agents carry an
  explicit `permission: { sdd-command: deny }`.
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
- **Test cases stay consistent with code**: When a change alters
  behavior, update the affected test cases — unit tests, the e2e
  suite, and the manual QA plan (`qa/testplan/plans/`) — in the same
  change. A case left asserting stale behavior, or written so it can
  never pass as-is (wrong endpoint, mismatched id, unreachable
  fixture), is a defect, not documentation: fix the case with the
  code.
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
- **Type-only dependencies are devDependencies**: The OpenCode Plugin
  package (`@opencode-ai/plugin`) is imported only for types (erased at
  compile time), so it lives in `devDependencies`. The OpenCode SDK
  package (`@opencode-ai/sdk`) is imported for types by the plugin entry
  (`import type { ... }`, erased at compile) AND imported at runtime by
  the CLI's model probe (`src/cli/model-probe.ts` — a value import of
  `createOpencodeServer`/`createOpencodeClient`); runtime placement wins,
  so the SDK lives in `dependencies`, pinned at the same version the
  plugin entry references for types (so the CLI's runtime, the CLI's
  type surface, and the plugin's type surface never skew). The compiled
  plugin output (`build/index.js`) retains zero runtime imports — enforced
  by `scripts/check-runtime-imports.mjs` in `pnpm build`, which fails the
  build on any leaked `@opencode-ai/*` value import in the plugin entry
  graph (excluding the top-level `build/cli/`); `import type { ... }` is
  the only correct form for these packages in the plugin entry.
- **Keep the opencode version in sync.** The opencode release is
  pinned in several places that MUST all be bumped together in a
  single change:
    - `package.json` pins `@opencode-ai/sdk` and `@opencode-ai/plugin`
      (published in lockstep with the binary); refresh the lockfile
      with `pnpm install`.
    - The `opencode` binary: the `OPENCODE_VERSION` env var in
      `.github/workflows/ci.yml` and the `OPENCODE_VERSION` build arg
      in `Dockerfile` and `qa/Dockerfile`.
    - Unit-test fixtures that encode the version:
      `prerequisites.test.ts` (detected `opencode --version` string),
      `install*.test.ts` (stubbed `DetectResult.version`), and
      `manifest.test.ts` (asserts the `@opencode-ai/sdk` pin).
    - Docs stating the version: `DEVELOPMENT.md` (verified-against
      notes and the Docker section) and `qa/testplan/README.md`
      (prerequisite table).
- The npm packages and the binary MAY differ by a patch (e.g. SDK
  `1.17.7` with binary `1.17.8`), but they MUST stay on the same
  minor line — the plugin is only verified against one opencode
  release at a time. After any bump, run `pnpm typecheck` (API
  compatibility against the new SDK types), `pnpm test`, and
  `pnpm test:e2e` (runtime behavior against the installed binary)
  before merging.
- Behavioral notes phrased "as of opencode 1.x.x" state what was
  verified at the time; do NOT reword them to a newer version without
  re-verifying the behavior against that release.

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
- **Continuation lines**: When a list item wraps to the next line, align
  the continuation with the first character of the item text, not the
  list marker. This applies to all list types (ordered and unordered).
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
