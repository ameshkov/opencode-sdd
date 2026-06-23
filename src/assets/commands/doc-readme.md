---
description: Actualize README.md to serve as a user manual for the product (provided by opencode-sdd)
---

# Create or update README.md

Update `README.md` to serve as a user manual — documentation that explains what
the product does and how to use it. Adapt the README structure to the product
type by using type-specific templates.

Optional focus or scope (may be empty): $ARGUMENTS

## Prerequisites

Before starting, verify the repository contains these required documents:

- `DEVELOPMENT.md` — development setup and workflow
- `AGENTS.md` — LLM agent guidance

Also check for these optional documents:

- `DEPLOYMENT.md` — installation, configuration, deployment
- `CHANGELOG.md` — changelog

If required documents are missing, ask the user whether to create them or
proceed without.

## Steps

### Phase 1: Information Gathering

1. **Read the current README.md**
    - Review the existing content
    - Note what sections exist and their quality
    - Identify content worth preserving

2. **Gather product information from the codebase**
    - Read `AGENTS.md` for project overview, technical context, and structure
    - Read `DEPLOYMENT.md` (if it exists) for understanding what the product
      does (not to copy content)
    - Read `DEVELOPMENT.md` for understanding capabilities
    - Examine entry points (main files, CLI commands, API routes, UI pages)
      to understand user interactions

3. **Determine the product type**

    Classify the project into one of these product types. Use the AGENTS.md
    project type field, codebase signals, and the existing README framing.

    Available types and their template files (in `assets/`):

    | Product type | Description | Template file |
    | --- | --- | --- |
    | Library | Imported as a dependency (npm, PyPI, Maven, etc.) | `readme-library.md` |
    | CLI tool / Installable | Installed and run locally | `readme-cli-tool.md` |
    | API service | Consumed over network (REST, gRPC, GraphQL) | `readme-api-service.md` |
    | Web application | Accessed via browser (SaaS, dashboard) | `readme-web-app.md` |
    | Web application + API | Accessed via browser with a public API | `readme-webapp-api.md` |
    | Desktop application | Native or cross-platform desktop app | `readme-desktop-app.md` |
    | Mobile application | iOS / Android app | `readme-mobile-app.md` |
    | Browser extension | Chrome / Firefox / Edge add-on | `readme-browser-extension.md` |
    | IDE extension | VS Code, JetBrains, or other IDE plugin | `readme-ide-extension.md` |
    | Network service / daemon | Background process serving a protocol | `readme-network-service.md` |
    | Generic | Fallback when no specific type fits | `readme-generic.md` |

    Use these signals to determine the type:

    - `AGENTS.md` fields: Project Overview, Target Platform, Project Type
    - Existing README content and framing
    - Codebase indicators: package.json `main`/`exports` fields, CLI entry
      points (`bin`), API route definitions, UI frameworks, Dockerfile
      exposing ports, app store references, etc.

    If the type is ambiguous or the project spans multiple types, **ask the
    user** which type best describes the primary audience's interaction.

    For hybrid products (e.g., a web application that also exposes a public
    API), check if a combined template exists (e.g., `readme-webapp-api.md`).
    If not, use the templates for each facet and **merge the sections**
    — keep the primary interaction model first, include the secondary
    sections below it.

4. **Identify information gaps**

    After gathering information, determine if you can answer these questions:

    - What does the product do? (purpose)
    - Who is it for? (target audience — developers, operators, end users,
      administrators, etc.)
    - What problem does it solve? (pain point, motivation for building it)
    - What can users do with it? (capabilities)
    - How do users get started? (installation, first use)
    - What inputs does it accept and what outputs does it produce?

    The **Description** section in the template requires a clear statement
    of target audience and the problem the product solves. If the codebase
    does not make these explicit, you must ask the user.

    Ask pointed questions until you have enough detail to write a meaningful
    Description. For example:

    - *"Who is the primary audience for this product?"*
    - *"What specific problem or pain point does it solve?"*
    - *"What motivated building it?"*

    Do not proceed until you can answer all of the above. If the user's
    initial answer is vague, ask follow-up questions to get concrete
    details. Iterate until the Description can be written with confidence.

5. **Ask about a screenshot**

    Ask the user: *"Would you like to include a screenshot in the README? If
    yes, please provide the image path or URL."*

    If they provide one, include it near the top of the README (after the
    one-line description). If not, omit the screenshot entirely.

    If the user indicates they will provide one in the future, include the
    `<img>` tag with a `TODO` HTML comment so they can drop in the image
    later:

    ```markdown
    <p align="center">
      <!-- TODO: add screenshot -->
      <img src="assets/screenshot.png" alt="Project screenshot" width="600">
    </p>
    ```

6. **Collect concrete access and installation details**

    The README must describe the product **as it exists today** — deployed,
    hosted, and ready to use. Ask the user for the specific values that
    cannot be inferred from the codebase:

    **For all types:**
    - What is the exact product name?
    - What is the one-line description?

    **Library:**
    - What is the package name in the package manager (npm install ...,
      pip install ..., etc.)?

    **CLI tool / Installable:**
    - What is the install command for each supported platform?
    - What is the binary name (if different from the project name)?

    **API service:**
    - What is the base URL of the live API?
    - What authentication method does it use?
    - Are there rate limits?

    **Web application:**
    - What is the live application URL?
    - What authentication method does it use?

    **Desktop application:**
    - What is the download URL or store page for each platform?
    - What are the system requirements?

    **Mobile application:**
    - What are the App Store, Google Play URLs, or APK download link?

    **Browser extension:**
    - What are the Chrome Web Store and Firefox Add-ons URLs?

    **IDE extension:**
    - What is the publisher name and extension ID?
    - What is the VSIX download URL or marketplace page?

    **Network service / daemon:**
    - What is the Docker image name and tag?
    - What package managers are supported (brew, apt, etc.)?
    - What is the default config file location?

    If the user provides these values, use them directly. If they cannot
    provide them, use reasonable defaults (e.g., `https://app.example.com`)
    and note that the user should update them.

### Phase 2: User Confirmation

1. **Present findings to the user**

    Before writing anything, present a concise summary of what you found.
    Include:

    - The detected **product type** and why you classified it that way
    - The **Description** content — target audience and problem statement
    - The **key points** for each section (capabilities, installation,
      usage)
    - Whether a screenshot will be included

    Ask the user to confirm or correct your findings before proceeding.

### Phase 3: Writing

1. **Read the template**

    Read the template file for the detected product type. Use the matching
    reference below:

    - Library / package:
      @opencode-sdd-templates/doc-readme/readme-library.md
    - CLI tool / installable:
      @opencode-sdd-templates/doc-readme/readme-cli-tool.md
    - API service:
      @opencode-sdd-templates/doc-readme/readme-api-service.md
    - Web application:
      @opencode-sdd-templates/doc-readme/readme-web-app.md
    - Web application + API:
      @opencode-sdd-templates/doc-readme/readme-webapp-api.md
    - Desktop application:
      @opencode-sdd-templates/doc-readme/readme-desktop-app.md
    - Mobile application:
      @opencode-sdd-templates/doc-readme/readme-mobile-app.md
    - Browser extension:
      @opencode-sdd-templates/doc-readme/readme-browser-extension.md
    - IDE extension:
      @opencode-sdd-templates/doc-readme/readme-ide-extension.md
    - Network service / daemon:
      @opencode-sdd-templates/doc-readme/readme-network-service.md
    - Documentation site:
      @opencode-sdd-templates/doc-readme/readme-documentation-site.md
    - Generic fallback:
      @opencode-sdd-templates/doc-readme/readme-generic.md

2. **Write the README**

    Follow the structure from the template, but adapt it to the actual
    product — do not copy template content verbatim if it doesn't fit.

    **Write as if the product is already built and deployed.** Use present
    tense and concrete values (obtained from the user in step 6 or from the
    codebase). Replace all example URLs, example commands, and placeholder
    package names with real values. Do not leave `example.com`,
    `project-name`, or similar placeholders in the final README.

    For hybrid product types (e.g., web app + API), if a combined template
    exists, use it. Otherwise, read the templates for each facet and merge
    the sections, keeping the primary interaction model first.

    Apply these rules across all types:

    **Include:**

    - What the product does and who it's for
    - User-facing capabilities (goal-oriented)
    - Installation or access instructions appropriate to the product type
    - Usage workflows and examples
    - Input/output expectations
    - Documentation navigation section at the bottom (see below)

    **Exclude (move to appropriate docs if present):**

    - Production deployment procedures (belongs in `DEPLOYMENT.md`)
    - Infrastructure, CI/CD, and scaling details
    - Build steps and developer workflows (belongs in `DEVELOPMENT.md`)
    - Internal architecture details (belongs in `AGENTS.md`)

3. **Add documentation navigation at the bottom**

    Place a `## Documentation` section at the bottom, before any trailing
    content. Include relative links to existing documents. Always include:

    ```markdown
    ## Documentation

    - [Development](DEVELOPMENT.md)
    - [LLM agent rules](AGENTS.md)
    ```

    Add these links only if the corresponding files exist:

    - `[Deployment and configuration](DEPLOYMENT.md)`
    - `[Changelog](CHANGELOG.md)`

### Phase 4: Validation

1. **Review against requirements**

    Verify the README (common checks for all types):

    - [ ] Describes what the product does and who it's for
    - [ ] Lists user-facing capabilities (not internal features)
    - [ ] Contains usage examples
    - [ ] Documentation section is at the bottom with links to all existing
      documentation files
    - [ ] Written as if the product is **already built and deployed** —
      present tense, concrete URLs and commands
    - [ ] Contains NO placeholder values (`example.com`, `project-name`,
      `your-...`) — all examples replaced with real values
    - [ ] Contains NO production deployment / CI/CD / infrastructure content
          unless this is a deployment-focused project without a separate
          `DEPLOYMENT.md`
    - [ ] Contains NO developer build steps or internal architecture unless
          this is a development-focused project without a separate
          `DEVELOPMENT.md`
    - [ ] Uses clear, neutral language (no marketing)
    - [ ] **Description** section clearly states **target audience** and
      **problem solved**, with enough detail for a new user to understand
      if the product is relevant to them

    Verify product-type-specific content against the template:

    - [ ] **Library**: includes dependency installation and API overview
    - [ ] **CLI tool**: includes install instructions and command/flag
      reference
    - [ ] **API service**: includes base URL, authentication, endpoints
    - [ ] **Web application**: includes access URL and features overview
    - [ ] **Desktop app**: includes platform-specific installs
    - [ ] **Mobile app**: includes store badges and OS requirements
    - [ ] **Browser extension**: includes store badges and permissions table
    - [ ] **Documentation site**: includes site URL and content structure
    - [ ] **IDE extension**: includes marketplace install, commands table,
      settings table
    - [ ] **Network service**: includes config file reference, protocol
      description, health check and monitoring
    - [ ] **Generic**: includes overview, getting started, and usage
      sections adapted to the product's interaction model

2. **Format and finalize**
    - Check markdown formatting
    - Ensure consistent heading levels
    - Verify all relative links work

## Guidelines

- **User manual, not tutorial**: Write as stable reference documentation
- **Type-specific templates**: Use the `assets/` templates as a starting
  point, adapt to the actual product
- **Confirm before writing**: Present findings to the user and get
  confirmation in Phase 2
- **Screenshot opt-in**: Ask the user, do not assume
- **No "Key concepts"**: Do not include abstract concept sections — describe
  capabilities and workflows directly
- **Documentation at the bottom**: Navigation links go in the last
  substantive section
- **No duplication**: Link to other docs, don't copy their content; README
  covers user-facing setup, `DEPLOYMENT.md` covers production deployment
- **Examples show usage**: Demonstrate actual work appropriate to the product
  type
- **Ask when uncertain**: If product type or behavior is unclear, ask the
  user
- **Preserve valid content**: Don't discard good existing content that fits
  requirements
- **Write as live**: Use present tense and concrete values. Describe the
  product as it exists today — deployed, hosted, ready to use. All URLs,
  commands, and package names must be real values obtained from the user
  or codebase.

### Type-Specific Writing Guidance

When writing from a template, apply these additional rules per product type:

**Library:**

- Focus on the **public API** — what users import and call
- Every public function/class should have at least one example
- Show the **most common use case first**, then edge cases
- Link to generated API docs (TypeDoc, JSDoc, Sphinx) for full reference

**CLI tool / Installable:**

- Assume the user has **no prior knowledge** of the tool
- Show a **complete, runnable** command in Quick Start
- Document every subcommand and important flag
- Include exit codes and error scenarios

**API service:**

- Document the **base URL, authentication, and protocol** upfront
- Every endpoint needs at least one **request/response example**
- Use `curl` examples — they work for everyone regardless of language
- Document error codes and what they mean
- Include rate limits and reliability guarantees

**Web application:**

- Start with **access instructions** — users need to know where to go and
  how to log in
- Describe features by **user goal**, not by technical implementation
- Include **screenshots** for key workflows when available
- Step-by-step workflows with UI element references (button names, menus)

**Desktop application:**

- **Platform-specific install instructions** — list every supported OS
- Include **system requirements** (OS version, RAM, disk space)
- Screenshots are especially important for desktop apps
- Configuration section should mention where config files are stored
- Include a FAQ or troubleshooting section for common issues

**Mobile application:**

- **Store badges** at the top of the installation section
- List **minimum OS requirements**
- Screenshots should be sized for mobile (narrow width)
- Describe features in terms of **user interaction**, not implementation
- Include a FAQ section for common mobile-specific issues (offline,
  permissions, background behavior)

**Browser extension:**

- **Store badges** for each supported browser
- Document **every permission** and why it's needed (privacy transparency)
- Describe features by where they appear in the browser UI (toolbar icon,
  context menu, popup, options page, content script behavior)
- Include a FAQ section for common extension issues (incompatible pages,
  conflicts)

**Documentation site:**

- Primary audience is **content consumers** — make navigation and search
  prominent
- Content structure section helps readers understand where to find things
- Include a contributing section for documentation contributors

**IDE extension:**

- Users install and use the extension inside an **IDE**, not as standalone
  software — frame everything in terms of IDE integration points (commands,
  settings, keybindings, context menus, code lenses, hover providers)
- List **every command** with its ID and title — users need the command ID
  for keybinding overrides
- List **every setting** with its default value
- Explain *when the extension activates* (on startup, on language type,
  on command invocation) — activation events matter for performance
- Installation is always via marketplace, VSIX, or sideloading — never via
  package managers

**Network service / daemon:**

- Users are **operators** — they need to install, configure, run, and
  monitor the service, not browse a UI or import an API
- Focus on **configuration** — config files, environment variables,
  command-line flags — this is how operators interact with the service
- Document the **protocol** the service speaks, not endpoints — tell
  operators what RFCs it implements and any non-standard behavior
- Include **health check, monitoring, and logs** — operators need to know
  if the service is running and how to debug it
- Installation includes **multiple OS package managers** and Docker —
  operators run on many platforms

**Generic / fallback:**

- Characterize the **primary interaction model** (CLI, API, UI, import)
  early in the Overview and structure the Usage section around it
- Describe the product in terms of **what users can do with it**, not
  how it works internally
- Be flexible with section structure — adapt to what makes sense for the
  actual product

**Web application + API:**

- Serve **two audiences** — end-users need the UI workflow documentation,
  developers need the API reference. Order the sections so the primary
  audience sees their content first
- Include **both** the web app URL and the API base URL in the Access
  section — make it clear there are two entry points
- Keep UI workflows and API endpoint docs in **separate sections** —
  don't mix them. A reader looking for endpoint specs should find them
  easily, not buried in UI walkthroughs
- Authentication often differs between the UI (session/cookie) and the
  API (token/API key) — document both clearly
- If the UI and API share an endpoint table, note which endpoints are
  consumed by the UI and which are public
