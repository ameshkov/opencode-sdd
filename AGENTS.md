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
    - [Code Quality](#code-quality)
    - [Testing](#testing)
    - [Dependency Management](#dependency-management)
    - [Configuration & Documentation](#configuration--documentation)
    - [Plugin Surface](#plugin-surface)
    - [Markdown Formatting](#markdown-formatting)

## Project Overview

This repository builds an opencode plugin (`opencode-sdd`) that installs a
specification-driven development (SDD) workflow into opencode. The plugin is
loaded by opencode and extends its merged configuration with:

- **Agents** — the hidden SDD worker subagents (`sdd-planner`,
  `sdd-reviewer`, `sdd-coder`, `sdd-validator`, `sdd-plan-reviewer`,
  `sdd-explore`) the commands delegate to.
- **Commands** — slash commands such as `prd-write` that produce
  specification artifacts.

The plugin does not run as a standalone process. It is a module whose
default export is a **dual entry object** `{ id, server, setup }`: V1 calls
`server(input)` and consumes the returned `Hooks` object (the `config` and
`tool` hooks); V2 requires `id` + `setup(ctx)` and registers the same
surface through the V2 editors. V1 never calls `setup`, and V2 ignores
`server`, so one package serves both hosts.

## Technical Context

| Field | Value |
| --- | --- |
| Language | TypeScript 6, ES2022 target, strict mode |
| Runtime | Node.js 24+ (loaded inside the opencode host) |
| Package Manager | pnpm 10+ |
| Framework | OpenCode Plugin SDK: V1 (`@opencode-ai/plugin`, `@opencode-ai/sdk`) and V2 (`@opencode/plugin`, `@opencode/sdk`) |
| Primary Dependencies | `@inquirer/prompts`, `jsonc-parser`, `diff` (CLI runtime); the OpenCode SDK/Plugin packages are type-only for the plugin entry, `@opencode/sdk` is dev-only (V2 e2e lane) |
| Storage | None — SDD artifacts are Markdown files under `SPECS_DIR` |
| Linting | ESLint 10.x + typescript-eslint |
| Formatting | Prettier 3.x, Markdownlint (markdownlint-cli2) |
| Unused-export analysis | Knip |
| Tests | Vitest 4.x |
| Target Platform | opencode 1.x (>= 1.18.29) and 2.x (2.0.x) host process (Node.js 24+), macOS/Linux/Windows |
| Project Type | opencode plugin (ESM, compiled to `build/`) |
| Performance Goals | N/A — startup-time registration of 11 commands and 6 agents |
| Constraints | zero runtime `@opencode-ai/*` and `@opencode/*` imports in the plugin entry; the `config`/`setup` paths must never throw; opencode hard-fails on invalid config |
| Scale/Scope | one opencode host process per user; registers 11 slash commands and 6 hidden subagents |

## Project Structure

The repository has two entry points — a plugin entry point loaded by
opencode and a CLI entry point run as a bin — plus bundled asset data
and the usual build/test scaffolding. Only the top-level modules are
listed here; each module's barrel (`index.ts`) defines its public API
and the files inside it are self-explanatory from their names.

```text
opencode-sdd/
├── src/
│   ├── index.ts                # Dual plugin entry { id, server, setup }
│   ├── host/                   # Host adapters: surface builder + V1/V2
│   │                           # registration (detect, surface, v1/, v2/)
│   ├── agents/                 # Agent loader: scans *.md → AgentConfig map
│   ├── commands/               # Command loader + template-inliner
│   │                           # (V2 inlines template file content)
│   ├── sdd-command/            # The `sdd-command` custom tool (allowlist,
│   │                           # source loader, neutral core + V1 adapter)
│   ├── cli/                    # `opencode-sdd install` binary (second entry point)
│   ├── utils/                  # Shared internals: logger port, frontmatter
│   │                           # helpers, template-token rewriter
│   ├── assets/agents/          # Bundled agent Markdown (frontmatter + prompt)
│   ├── assets/commands/        # Bundled command Markdown files
│   └── assets/commands/templates/  # Prompt templates referenced by commands
│                              # via the @opencode-sdd-templates/ token
├── test/                       # Shared test support code (plugin-helpers,
│                               # stub-client, fixtures) — NOT test cases
├── test-e2e/                   # Mock-LLM end-to-end suite, split into
│                               # shared/ (mock LLM + scenarios), v1/ (real
│                               # 1.x server) and v2/ (in-process SDK host +
│                               # real opencode2 loader smoke)
├── scripts/                    # Build-time helpers (copy-assets,
│                               # check-runtime-imports)
├── docs/                        # Reference docs (docs/reference/:
│                               # install CLI + slash commands),
│                               # long-form developer docs (e2e.md,
│                               # assets/), and implementation plans
│                               # (docs/plans/)
├── qa/                          # Manual QA suite: the OpenRouter-backed
│                               # bifrost gateway compose + model allowlist
│                               # (qa/bifrost/), the isolated workspace
│                               # image (Dockerfile: opencode + toolchain,
│                               # plugin baked in; V1 and V2 environments
│                               # via docker-compose.v2.yml), host-side
│                               # lifecycle scripts (qa/scripts/setup/) and
│                               # in-container payload scripts
│                               # (qa/docker/: pty-driver, serve-web),
│                               # the gitignored key file
│                               # (qa/.env, template qa/.env.example),
│                               # Gherkin test plans (qa/features/), the
│                               # manual test runner and ID check
│                               # (qa/scripts/bdd/), and the run reports
│                               # (qa/output/)
├── .agents/skills/              # Manual QA skills: qa-test-planning
│                               # (coverage matrix + case selection) and
│                               # manual-test-run (execute + record)
├── .github/                     # CI workflows (quality gate, canary, release)
├── .husky/                      # pre-commit hook (pnpm check + e2e)
├── README.md, DEVELOPMENT.md    # User-facing + build/debug guides
├── CHANGELOG.md                 # Release history
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
- `pnpm test` — run the Vitest unit suite once (excludes
  `*.e2e.test.ts`)
- `pnpm test:watch` — run Vitest in watch mode
- `pnpm lint` — lint source files with ESLint, check for unused
  exports with Knip, and verify the Gherkin QA plans (`lint:gherkin`:
  `@TC-*` ID convention, `@V1`/`@V2` applicability tags, and
  `gherkin-lint` over `qa/features/`)
- `pnpm lint:fix` — lint and auto-fix issues
- `pnpm lint:gherkin` — run only the Gherkin plan checks
- `pnpm knip` — run Knip unused-export analysis separately
- `pnpm format:check` — check formatting with Prettier and Markdownlint
- `pnpm format:fix` — fix formatting issues
- `pnpm check` — run `format:check`, `lint`, `typecheck`, and `test`
  (full CI gate)
- `pnpm test:e2e` — run both mock-LLM e2e lanes (`:v1` then `:v2`; NOT
  part of `pnpm check`)
- `pnpm test:e2e:v1` — V1 lane against a real opencode 1.x server
  (needs the `opencode` binary on PATH and a built `build/`)
- `pnpm test:e2e:v2` — V2 lane: in-process `@opencode/sdk` specs plus a
  loader smoke against `opencode2` (skips itself when absent)
- `pnpm qa:run` — run the interactive manual QA runner over
  `qa/features/` (writes a report to `qa/output/`; `--env v1|v2`
  selects the stack and filters by applicability tags)
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

- When you need to test anything against a real `opencode` host, do NOT
  mess with the local opencode installation (its config files, state,
  or installed binary). Always run it inside a Docker image instead —
  the project images (`Dockerfile`, `qa/Dockerfile`) carry the tested
  `opencode` binary and the plugin, and the virtual opencode config
  stays isolated from the host.

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
- Export a stable public API: the default dual entry object
  `{ id, server, setup }`, where `server` returns the V1 `Hooks` object
  (`@opencode-ai/plugin`) and `setup` registers the V2 surface
  (`@opencode/plugin`). Internal modules (loaders, parsers, rewriters,
  host adapters, utilities) are reached only through barrel `index.ts`
  files.
- Keep the dependency footprint minimal — the OpenCode Plugin and SDK
  packages are type-only (`devDependencies`, erased at compile time), so
  the compiled `build/` output has zero runtime imports. This is enforced
  by `scripts/check-runtime-imports.mjs` in `pnpm build` (fails the build
  on any leaked `@opencode-ai/*` or `@opencode/*` value import);
  `import type { ... }` is the only correct form for these packages.
- Side effects are confined to the `config` hook (V1) and `setup` (V2):
  the V1 hook mutates opencode's merged `Config` in place to register
  agents and commands; the V2 setup registers through the host editors.
  The only other side effect is filesystem reads of bundled asset
  Markdown at registration time, which is part of the plugin contract.
- Provide complete type definitions so the plugin is usable with static
  type checking against the SDK (`AgentConfig`, derived command types).
  opencode hard-fails on invalid config, so the compiler catches shape
  mistakes early.
- Handle errors by degrading gracefully inside the `config` hook / `setup`
  — if a feature fails to register, log and continue rather than breaking
  opencode startup. Never let either path throw.
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
  host-neutral surface → host adapter (V1 `Config` mutation / V2 editors).
  No hidden side channels.
- **Minimize Coupling, Maximize Cohesion** — modules are self-contained
  and interact through narrow interfaces.
- **Make Invalid States Impossible** — use TypeScript strict mode and
  validation to prevent illegal combinations at compile time.
- **Observability Built-in** — the plugin surfaces its behavior through
  the host-neutral `Logger` port (`src/utils/logger.ts`): V1 forwards to
  `client.app.log`, V2 writes to stderr; every registration step logs at
  an appropriate level so failures are diagnosable.
- **Keep It Boring** — prefer well-understood patterns over clever or
  novel solutions.

The project's layers, from top to bottom:

- **Entry point** (`src/index.ts`) — the dual entry object; `server()`
  returns the V1 hooks, `setup()` registers the V2 surface.
- **Host adapters** (`src/host/`) — the host-neutral surface builder plus
  the V1 and V2 registration adapters. Sibling adapters never import each
  other; shared code lives at the `host/` level (`detect.ts`,
  `surface.ts`). The adapters map the same loaded surface onto V1
  `Config` mutations and V2 editor registrations.
- **Definitions** (`src/agents/`, `src/commands/`, `src/sdd-command/`) —
  Markdown agent and command files loaded at startup via their loaders,
  plus their frontmatter parsers, the command template inliner, and the
  host-neutral `sdd-command` tool core. No side effects beyond logging.
- **Data** (`src/assets/agents/`, `src/assets/commands/` +
  `src/assets/commands/templates/`) — Bundled agent Markdown files,
  command Markdown files, and prompt template assets.

```text
Entry point (index.ts)
      ↓
Host adapters (host/: v1/, v2/)
      ↓
Definitions (agents/, commands/, sdd-command/)
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
`@opencode-ai/*` and `@opencode/*` imports — such imports live only in
the CLI graph (`build/cli/`), enforced by
`scripts/check-runtime-imports.mjs` in `pnpm build`.

```text
CLI entry (src/cli/install.ts)
      ↓
CLI modules (src/cli/*.ts: argv, prerequisites, detect-host,
            config-resolver, target-select, model-probe, v2-model-probe,
            host-probe, recommend, yes-selection,
            interactive-selection, config-patcher, plugin-entry,
            own-package, agent-model-*, install, usage, bin-entry,
            config-paths, confirm-patch, server-auth)
      ↓
User opencode config on disk (read + JSONC-safe patch + atomic write)
```

The install CLI writes exactly three plugin entry forms: the bare
`opencode-sdd` (npm `latest`), `opencode-sdd@<tag|version>` (an
`npm-package-arg` registry spec — verified against opencode 1.18.29,
which resolves plugin specs via `npm-package-arg` + Arborist), and
`file://<abs-path>` for local builds. Never write the `npm:`-prefixed
form: `npm-package-arg` parses it as an alias TARGET, not a registry
spec, so it cannot resolve to `opencode-sdd`. The local form is
host-specific: `file://<root>` on V1 (which resolves `package.json#main`)
and `file://<root>/build` on V2 (which resolves `<dir>/index.js` and
ignores `main`). The CLI refuses V1 below 1.18.29 and writes `plugin`/
`agent` keys on V1, `plugins`/`agents` on V2.

Definitions MUST NOT import from the entry point. Sibling definition
layers (`agents/`, `commands/`, `sdd-command/`) MUST NOT import from each
other; shared helpers live in the `utils/` layer below them. New layers (e.g.,
services, utilities) introduced in later iterations MUST sit below the
entry point and above definitions only when they are consumed by them.

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
- **Secrets and API keys**: Never write credentials (API keys, tokens,
  passwords) into the repository — not in source, scripts, config files,
  fixture data, compose files, or shell-history-prone tooling. When a
  script needs a secret, obtain it at runtime from the environment, a
  file kept OUTSIDE the repo, or a hidden interactive prompt; export it
  into the child process environment without ever echoing it, and never
  pass it via command-line arguments. Make starts human-gated when the
  secret unlocks a paid service: a non-interactive invocation without an
  explicit secret must fail with clear instructions, so an automated
  agent can never start the service on its own (see
  `qa/scripts/setup/lib-openrouter-key.sh`). Exception for the manual QA
  suite: the gitignored `qa/.env` (template `qa/.env.example`) may carry
  the OpenRouter key — compose auto-loads it and the start scripts read
  it — but no tracked file may contain it, and a non-interactive start
  with no key source must still refuse.
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
- **Host-neutral tests use the host-neutral logger stub**: Unit tests for
  host-neutral modules (`agents/`, `commands/`, `sdd-command/`, `utils/`)
  MUST use `stubLogger()` from `test/plugin-helpers.ts` rather than a host
  adapter logger (`createV1Logger`/`createV2Logger`). Those modules never
  exercise host logging, and importing a host adapter would point the
  dependency from a lower layer up to the host adapters.
- **Test verification mandatory**: All changes MUST pass `pnpm test`
  before merge. Tests MUST NOT be deleted or weakened without explicit
  justification.
- **Test cases stay consistent with code**: When a change alters
  behavior, update the affected test cases — unit tests, the e2e
  suite, and the manual QA plan (`qa/features/`) — in the same
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

The `test-e2e/` suite exercises the plugin against a real opencode host on
both lines, driven by a local mock OpenAI-compatible LLM (`node:http` +
SSE). It is deterministic, offline, and needs no API keys. The suite is
split into `shared/` (mock LLM, scenarios, host-neutral harness pieces),
`v1/` (the real 1.x binary lane) and `v2/` (an in-process `@opencode/sdk`
lane plus a real-`opencode2` loader smoke):

- **Prerequisites**: a built `build/` always; the V1 lane additionally
  requires an opencode **1.x** binary on PATH and its `globalSetup`
  (`test-e2e/v1/global-setup.ts`) asserts the major. The V2 lane runs its
  in-process specs without a binary; the loader smoke skips itself when
  `opencode2` is absent and runs in CI, which installs `@opencode/cli`.
- **Scope**: `pnpm test:e2e:v1` / `:v2` run the lanes; `pnpm test:e2e`
  runs both. They are intentionally **not** part of `pnpm check`; the main
  `vitest.config.ts` excludes `*.e2e.test.ts` so the CI gate never requires
  a binary. The host-neutral unit tests (`test-e2e/shared/mock-server.test.ts`,
  `test-e2e/v1/harness.test.ts`) still run under `pnpm test`.
- **Type checking**: `test-e2e/**/*` is included in `tsconfig.json`, so
  `pnpm typecheck` covers it; it is never compiled into `build/`.
- **How it works**: see [`docs/e2e.md`](docs/e2e.md) for the lane layout,
  the mock LLM, server lifecycle, permission auto-approve, and the
  template-inlining differences between V1 and V2.

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
- **Keep the opencode versions in sync.** Two version lines are pinned
  in several places each; bump all pins for a line together in a single
  change.
    - V1 (`@opencode-ai/*`): `package.json` pins `@opencode-ai/sdk`
      (runtime, CLI probe) and `@opencode-ai/plugin` (types); refresh
      the lockfile with `pnpm install`.
    - V2 (`@opencode/*`): `package.json` pins `@opencode/plugin`
      (type-only devDependency) and `@opencode/sdk` (devDependency for
      the V2 e2e lane) at the same version as the V2 binary.
    - The binaries: the `OPENCODE_VERSION` / `OPENCODE_V2_VERSION` env
      vars in `.github/workflows/ci.yml`, the matching build args in
      `Dockerfile` and `qa/Dockerfile`, and the `qa/docker-compose.v2.yml`
      build args.
    - Unit-test fixtures that encode the versions:
      `prerequisites.test.ts` (detected `opencode --version` strings),
      `install*.test.ts` (stubbed `DetectResult`), `manifest.test.ts`
      (asserts both SDK pins), and the V2 adapter tests.
    - Docs stating the versions: `DEVELOPMENT.md` (verified-against
      notes and the Docker section), `docs/e2e.md`, and `qa/README.md`
      (prerequisite table).
- The npm packages and the binary MAY differ by a patch (e.g. SDK
  `1.17.7` with binary `1.17.8`), but they MUST stay on the same
  minor line — the plugin is only verified against one release per
  line at a time. After any bump, run `pnpm typecheck` (API
  compatibility against the new SDK types), `pnpm test`, and the
  matching e2e lane (`pnpm test:e2e:v1` / `:v2`) before merging.
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
- **Reference docs**: `docs/reference/` owns the install CLI reference
  (`install-cli.md`) and the slash-command reference (`commands.md`);
  `README.md` and `DEVELOPMENT.md` keep summaries and link there. When the
  wizard's flags or behavior change, update `install-cli.md` and the
  README Install section in the same change; when the command surface
  changes, update `commands.md`. When host support changes, update the
  supported-version statements in `README.md`, `DEVELOPMENT.md`,
  `docs/e2e.md`, `docs/reference/install-cli.md`, and `qa/README.md` in
  the same change.
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

### Plugin Surface

The plugin registers the same surface through two host-specific paths:
the V1 `config`/`tool` hooks and the V2 `setup(ctx)` editors. The rules
below describe the V1 `config` hook unless stated otherwise; the V2
adapter (`src/host/v2/`) maps the same loaded surface onto
`agent.transform`/`command.transform`/`tool.transform`.

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
  switcher. There is no dedicated orchestrator agent: `/prd-auto-implement`
  runs under whatever agent the user invokes it with, and every shipped
  agent is a hidden `subagent` so it coexists with opencode's built-in
  agents.
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
- **The plugin must not throw during load.** Keep the `config` hook and
  V2 `setup` deterministic; if registration of a feature fails, degrade
  gracefully rather than breaking opencode startup.
- **V2 specifics (verified against 2.0.14).** V2 registration goes
  through editor transforms: `ctx.agent.transform` (upsert via
  `editor.update(id, mutator)` — a missing id is created),
  `ctx.command.transform` (`editor.add({ name, description, execute })`)
  and `ctx.tool.transform`. The `sdd-command` tool is registered with
  `options: { codemode: false, permission: 'sdd-command' }`: without
  `codemode: false` V2 folds plugin tools into its CodeMode `execute`
  tool, and `permission` makes the tool's permission action match the V1
  key so the per-agent rules gate it. Agent frontmatter permission maps
  are mapped onto V2 rules (`bash` -> `shell`, `task` -> `subagent`;
  last-match-wins), the global deny is expressed as a per-agent
  `{ action: 'sdd-command', resource: '*', effect: 'deny' }` appended to
  non-SDD agents, and the templates grant becomes an
  `external_directory` allow rule on the SDD agents. V2 does not inline
  `@<abs-path>` mentions in prompts, so the V2 command adapter inlines
  the referenced template file content itself
  (`src/commands/template-inliner.ts`).

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
