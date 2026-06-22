---
title: doc-agents
description: Update or create AGENTS.md for LLM agent guidance
---

Update or create `AGENTS.md` — a document that provides LLM agents (and human
contributors) with project context, structure, build commands, contribution
rules, and code guidelines.

Optional focus or scope (may be empty): $ARGUMENTS

## Core Principles

AGENTS.md is a **working reference for AI coding agents**, not a developer
onboarding guide. It should tell the agent:

1. **What patterns to follow** — architectural conventions, coding style,
   error-handling strategy, testing discipline.
2. **Where to find program modules** — a project-structure tree so the agent can
   navigate the codebase without guessing.
3. **How to verify work** — explicit commands to run and rules to check after
   completing a task.

It should **NOT** explain how to set up the development environment (installing
tools, cloning repos, configuring editor plugins, etc.)
— that belongs in `DEVELOPMENT.md` or `README.md`. AGENTS.md links to those
documents for environment setup but keeps its own content focused on in-project
conventions.

Additional principles to follow while writing AGENTS.md:

- **Accuracy over completeness**: Only document what you can verify; mark
  unknowns as TBD or ask the user
- **Keep it maintainable**: Don’t over-document; focus on what agents need
- **Match project reality**: Commands and structure must reflect actual state
- **Preserve valid content**: Don’t discard existing content that’s still
  accurate
- **Ask when uncertain**: If conventions or architecture are unclear, ask the
  user
- **Complete all sections**: Replace generic or incomplete content with actual
  project details, or remove sections that don’t apply

## Prerequisites

Before starting, verify the repository contains these resources:

- Source code with identifiable structure
- Build/test configuration files (e.g., `package.json`, `pyproject.toml`,
  `Makefile`, `go.mod`)
- Existing `AGENTS.md` (will be updated) or none (will be created)

If the project has no source code yet, ask the user whether to create a skeleton
`AGENTS.md` or wait until code exists.

## Steps

### Phase 1: Information Gathering

1. **Read the current AGENTS.md (if exists)**
   - Review existing content
   - Note which sections are filled vs incomplete
   - Identify outdated or incorrect information

2. **Gather project information from the codebase**
   - Examine build/dependency files (`package.json`, `pyproject.toml`,
     `Cargo.toml`, `go.mod`, `Makefile`, etc.)
     for:
     - Language and version
     - Primary dependencies
     - Build, test, and lint commands
   - Scan the directory structure to identify module directories and key files
     (see Phase 3 step 3 for inclusion criteria)
   - Read `README.md` for project purpose (if exists)
   - Check for database/storage configuration files
   - Identify testing framework from test files or config
   - Look for linter/formatter configs (`.eslintrc`, `ruff.toml`, etc.)

3. **Research the codebase architecture** If the agent runtime supports
   it, use the runSubagent tool to run an exploration sub-agent for
   this research; otherwise do it yourself.
   The research MUST answer:

   - What layers exist in the codebase?
     (entry point, routes/handlers, services, data access, utilities, etc.)
   - What is the dependency flow between them?
   - Are there any violations of clean layered architecture?
     (e.g., business logic in handlers, circular dependencies, services
     importing from routes, shared mutable state, framework coupling in business
     logic)

   Keep the research results for Phase 3 step 6.2 (Architecture subsection).

4. **Audit project dependencies** Review the project’s dependency manifest
   (e.g., `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`) against the
   Dependency Management guidelines:

   - Are all versions pinned exactly, or do some use ranges?
   - Are there niche / low-popularity packages that could be replaced with
     standard-library solutions or more established alternatives?
   - Are there dependencies that duplicate functionality already available in
     the language’s built-in APIs?

   Record any violations found.
   These will be listed as known exclusions in the Dependency Management
   subsection (Phase 3 step 6.5).

5. **Identify information gaps** After gathering information, determine if you
   can answer these questions:
   - What does the project do?
     (for Project Overview)
   - What language/framework is used?
   - What are the main directories and their purposes?
   - What commands build, test, and lint the project?
   - What storage/database is used (if any)?
   - What platform does it target?
   - What are the project’s architectural patterns?
   - **What is the project type?** — Identify the deployment and runtime
     category. Common types include: web service, website, mobile app, desktop
     app, browser extension, CLI tool, MCP server, documentation site,
     library/package. Look for clues in dependencies (e.g., Express/Hono → web
     service; React Native/Flutter → mobile; Electron/Tauri → desktop; browser
     extension APIs/manifest → browser extension; Commander/Clap → CLI;
     @modelcontextprotocol/sdk → MCP server).
     This determines the System Design subsection in Code Guidelines.

   If critical questions cannot be answered from the codebase, **ask the user
   for clarification** before proceeding.

### Phase 2: Content Planning

1. **Plan updates for each section** Map gathered information to AGENTS.md
   sections:
   - **Project Overview**: Brief description from README or code analysis
   - **Technical Context**: Language, dependencies, storage, testing, platform
   - **Project Structure**: Directory tree with descriptions
   - **Build And Test Commands**: Extracted from build config files
   - **Contribution Instructions**: Adapt default rules to project’s tooling
   - **Code Guidelines**: Infer from existing code patterns, project type, and
     architecture decisions.
     Subsections MUST appear in this order: System Design, Architecture, Code
     Quality, Testing, Dependency Management, Configuration & Documentation,
     Markdown Formatting, Other.
     Select the System Design template that matches the project type (see Phase
     3 steps 6.1–6.7)

2. **Identify project-specific rules** Note any patterns that should become
   contribution rules:
   - Required linting/formatting commands
   - Test requirements
   - Documentation standards
   - Commit/PR conventions

### Phase 3: Writing

The generated document MUST include a table of contents after the main heading,
listing all sections of heading levels 1 through 3 as markdown links.

1. **Update Project Overview**
   - Write a concise description of what the project does
   - Replace any incomplete or generic content with actual project details

2. **Update Technical Context** Fill in all applicable fields:
   - **Language/Version**: Exact version from config files
   - **Primary Dependencies**: Key frameworks/libraries
   - **Storage**: Database or storage solution
   - **Testing**: Testing framework used
   - **Target Platform**: Where the code runs
   - **Project Type**: single/web/mobile/monorepo
   - **Performance Goals**: If documented, otherwise ask or mark N/A
   - **Constraints**: Known limitations
   - **Scale/Scope**: Target audience size

3. **Update Project Structure** Generate a directory tree that helps developers
   and agents understand the project layout without overwhelming detail.

   **Directory rules:**
   - MUST include all directories that represent program modules or major
     functional areas (e.g., `src/auth/`, `pkg/models/`, `internal/db/`)
   - MUST include top-level directories with brief descriptions
   - SHOULD omit deeply nested subdirectories unless they represent distinct
     modules
   - SHOULD omit directories whose purpose is obvious from the parent (e.g.,
     skip `src/auth/__pycache__/`)

   **File inclusion rules — include individual files only when they:**
   - Are project entry points (e.g., `main.go`, `app.py`, `index.ts`)
   - Are build/config files at the repo root (e.g., `Makefile`, `Dockerfile`,
     `package.json`, `.eslintrc`)
   - Are standalone scripts not grouped in a module directory
   - Are documentation files at the repo root (e.g., `README.md`, `AGENTS.md`)
   - Have no containing directory in the tree (i.e., they would otherwise be
     invisible)

   **Omit individual files when:**
   - They are inside a directory that is already listed (the directory entry is
     sufficient)
   - Their purpose is obvious from the directory description
   - They are generated, cached, or vendored files

   **Formatting:**
   - Use a `text` code block with tree-style indentation (`├──`, `└──`)
   - Add a brief `# comment` after each entry to describe its purpose
   - Keep the tree to roughly 15–30 lines; collapse deep subtrees with a comment
     like `# ... (N modules)`

4. **Update Build And Test Commands** List all relevant commands:
   - Build command
   - Test command (unit, integration, e2e if applicable)
   - Lint command
   - Format command
   - Run/start command
   - Any other common development commands

5. **Update Contribution Instructions** Write contribution instructions as a
   **flat list of imperative rules** — each rule is a top-level bullet telling
   the agent what it MUST do after completing a task.
   Do NOT group rules under meta-headings like “Mandatory rules” or “Essential
   checks”. Focus on post-task verification steps — running linters, formatters,
   type checkers, and unit tests — not on commit or merge procedures.

   Example of the expected style (fill in with the project’s actual
   commands). Read the example in
   @opencode-sdd-templates/doc-agents/contribution-instructions-example.md

   The following rules MUST appear in every Contribution Instructions section,
   worded to fit the project’s commands and style:

   - A rule requiring verification with the linter, formatter, and type checker,
     with the actual project commands listed (as a sub-bullet list)
   - A rule requiring unit tests to be updated for changed code
   - A rule requiring all tests to pass
   - A rule requiring the Project Structure section in `AGENTS.md` to be updated
     when the project structure changes
   - A rule requiring the agent to extract code guidelines from refactoring
     prompts, adding them to the Code Guidelines section in `AGENTS.md`
   - A rule requiring the agent to verify that new code follows the Code
     Guidelines in `AGENTS.md`

   Keep existing project-specific rules that still apply; remove those that
   don’t. Add any project-specific rules discovered during analysis.

6. **Update Code Guidelines** For each subsection below (6.1–6.8), fill in
   patterns observed in the codebase, include rationale where clear, remove any
   incomplete or generic content, and ask the user for guidance on unclear
   conventions.

   **6.1. System Design** (first subsection of Code Guidelines):

   The System Design subsection MUST appear as the first subsection under Code
   Guidelines. Its content depends on the project type detected in Phase 1.
   Select the matching template below, adapt it to the project’s technology
   choices, and keep only the rules that apply.

   - **Web service / Website / API server / MCP server** — distributed
     environment: Read the template in
     @opencode-sdd-templates/doc-agents/system-design-web-service.md

   - **Mobile app** — device-resident, latency-sensitive: Read the template
     in
     @opencode-sdd-templates/doc-agents/system-design-mobile-app.md

   - **Desktop app** — long-running, resource-rich: Read the template in
     @opencode-sdd-templates/doc-agents/system-design-desktop-app.md

   - **Browser extension** — sandboxed, limited APIs: Read the template in
     @opencode-sdd-templates/doc-agents/system-design-browser-extension.md

   - **CLI tool** — run-and-exit, scriptable: Read the template in
     @opencode-sdd-templates/doc-agents/system-design-cli-tool.md

   - **Library / Package** — consumed by other code: Read the template in
     @opencode-sdd-templates/doc-agents/system-design-library.md

   - **Documentation site** — static content, no server: Read the template
     in
     @opencode-sdd-templates/doc-agents/system-design-documentation-site.md

   If the project does not fit any of the above types, write a System Design
   subsection based on the principles that apply to its runtime environment.
   Ask the user for guidance if unsure.

   **6.2. Architecture** (second subsection of Code Guidelines):

   Use the architecture research results from Phase 1 step 3 to write this
   subsection.

   Start with a short list of universal design principles the codebase should
   follow. Include all principles listed below.
   For principles that are less critical to the specific project, still include
   them but add a brief note explaining why they are less important in this
   context. Keep one short comment per principle — enough to remind the reader
   what it means, not a textbook definition.

   Universal principles to consider:

   - **Separation of Concerns** — each module handles one aspect of the system
   - **Single Responsibility Principle** — every file, class, or function has
     one reason to change
   - **Dependency Direction** — dependencies point inward / downward; never from
     lower layers to higher ones
   - **Explicit Boundaries** — module interfaces are intentional; no reaching
     into internals
   - **Data Flow Clarity** — data moves through the system in a predictable,
     traceable path
   - **Minimize Coupling, Maximize Cohesion** — modules are self-contained and
     interact through narrow interfaces
   - **Make Invalid States Impossible** — use types and validation to prevent
     illegal combinations at compile time
   - **Observability Built-in** — logging, metrics, and error reporting are
     first-class, not afterthoughts
   - **Keep It Boring** — prefer well-understood patterns over clever or novel
     solutions

   After the principles, describe the **layered architecture** of the project.
   Most codebases — regardless of type — benefit from explicit layers.
   Based on the research results, list each layer with its responsibility and
   1–2 concrete file/directory examples from the project.

   Then show the **dependency flow** as a top-down text diagram inside a `text`
   code block.

   If the research found any **violations** of the universal principles or the
   layered dependency rules, list them as explicit exclusions that may be fixed
   in the future. If there are no violations, omit the exclusions list.

   Example of the expected output. Read the example in
   @opencode-sdd-templates/doc-agents/architecture-example.md

   **6.3. Code Quality** (third subsection of Code Guidelines):

   Document the code quality standards observed in the codebase.
   Look for:
   - Documentation requirements (doc comments, inline comments)
   - Static analysis gates (linter, formatter, type checker)
   - Rules about modifying linter/formatter configs
   - Error handling strategy (throw vs return, where to catch)
   - Error reporting conventions (error tracking, logging levels)
   - Naming conventions (file naming, variable naming, class naming)
   - Import/module conventions (re-exports, path aliases, visibility rules)

   Include rationale where clear.
   Remove any incomplete or generic content.
   Ask the user for guidance on unclear conventions.

   **6.4. Testing** (fourth subsection of Code Guidelines):

   Document the testing discipline observed in the codebase.
   Look for:
   - Test file placement and naming conventions
   - Coverage requirements
   - Mocking strategy (what to mock, how)
   - Test verification requirements (must pass before merge)
   - E2E testing conventions
   - Test data management

   Include rationale where clear.
   Remove any incomplete or generic content.
   Ask the user for guidance on unclear conventions.

   **6.5. Dependency Management** (fifth subsection of Code Guidelines):

   This subsection is prescriptive, not deduced from the codebase.
   Include the following guidelines, adapted to the project’s package manager
   and ecosystem:

   - **Pin all dependency versions explicitly** — do not use version ranges that
     allow automatic upgrades to untested versions.
   - **Prefer vanilla solutions** — use the language’s standard library and
     built-in APIs when they adequately solve the problem.
     Only add a dependency when it provides significant value over a vanilla
     implementation.
   - **Reputable sources only** — dependencies MUST come from well-established,
     actively maintained projects.
     Evaluate by download counts, repository activity, and known maintainers.
   - **Avoid unpopular libraries** — do NOT add niche or obscure packages with
     limited community adoption.
     These pose security risks and may become unmaintained.
   - **Minimize dependency count** — each new dependency increases attack
     surface, bundle size, and maintenance burden.
     Justify every addition.
   - **Use the latest stable version** — when adding a new dependency,
     explicitly check the package registry for the latest stable release and use
     it. Do not copy outdated version numbers from memory, training data, or
     existing lock files of other projects.

   **Rationale**: Fewer, well-vetted dependencies reduce security
   vulnerabilities, supply chain risks, and long-term maintenance costs.

   If the dependency audit from Phase 1 step 4 found any violations, list them
   as **known exclusions** that should be fixed in the future.

   **6.6. Configuration & Documentation** (sixth subsection of Code Guidelines):

   Document how the project handles configuration and keeps documentation in
   sync with code. Look for:
   - How the program is configured at runtime (environment variables, config
     files, CLI flags)
   - Example configuration files and their locations (e.g., `.env.example`
     committed to the repo, `.env` gitignored for local overrides)
   - Which documentation files must be updated when code changes — for example,
     changes to build commands, project structure, public API, or deployment
     process
   - Rules about hardcoded values and secrets

   Include rationale where clear.
   Remove any incomplete or generic content.
   Ask the user for guidance on unclear conventions.

   **6.7. Markdown Formatting** (seventh subsection of Code Guidelines):

   Document the Markdown formatting rules for the project.
   Uniform Markdown formatting is important because AI agents consume project
   documentation as context — inconsistent formatting wastes tokens and can
   confuse tools that parse Markdown.

   This subsection is prescriptive.
   Include the following rules verbatim, adapting only the allowed HTML elements
   if the project needs different ones:

   Read the template in
   @opencode-sdd-templates/doc-agents/markdown-formatting-rules.md

   If the project has a Markdownlint configuration file (`.markdownlint.json`,
   `.markdownlint.yaml`, `.markdownlint-cli2.yaml`), verify the rules above are
   consistent with it and adjust any project-specific overrides (e.g., different
   allowed HTML elements).

   **6.8. Other** (final subsection of Code Guidelines):

   Capture any project-specific conventions that do not fit into the subsections
   above. Examples: logging format rules, commit message conventions, file naming
   conventions. Only include this subsection if there are conventions to
   document; omit it if empty.

### Phase 4: Validation

1. **Review against structure requirements** Verify the AGENTS.md:
   - [ ] Has a clear Project Overview (no generic or incomplete content)
   - [ ] Technical Context fields are filled or explicitly marked N/A
   - [ ] Project Structure matches actual codebase
   - [ ] Build And Test Commands are accurate and runnable
   - [ ] Contribution Instructions reference actual project commands
   - [ ] Contribution Instructions use a flat imperative bullet-list style (no
     grouping under meta-headings)
   - [ ] Contribution Instructions include all six required rules (verify with
     linter/formatter/type-checker, update unit tests, all tests pass, update
     project structure, extract code guidelines, verify against code guidelines)
   - [ ] Code Guidelines include a System Design subsection as the first
     subsection, with rules matching the detected project type
   - [ ] Code Guidelines include an Architecture subsection with universal
     principles, a layer table, and a dependency flow diagram
   - [ ] Architecture violations (if any) are listed as explicit exclusions
   - [ ] Code Guidelines subsections appear in order: System Design,
     Architecture, Code Quality, Testing, Dependency Management, Configuration &
     Documentation, Markdown Formatting, Other
   - [ ] Code Guidelines reflect actual project patterns
   - [ ] No incomplete or generic content remains in filled sections
   - [ ] All commands are correct (test by running if possible)

2. **Verify commands work** If possible, run the documented commands to verify
   they work:
   - Build command
   - Lint command
   - Test command (at least check it starts)

3. **Format and finalize**
   - Check markdown formatting
   - Ensure consistent heading levels
   - Verify code blocks use correct language tags
