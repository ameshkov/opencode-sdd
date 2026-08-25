# Group H — Doc maintenance commands

Smoke group: verify each doc command writes the right file with
type-specific content. Runs on fixture F4; P2 because output quality is
model-dependent.

## TC-DOC-01 — CHANGELOG maintenance (P2)

- **Objective**: Verify `/doc-changelog` derives entries from git history.
- **Verification**: file assertions vs `git log`.
- **Preconditions**: scratch repo with 2-3 commits since the initial one;
  no `CHANGELOG.md`.
- **Steps**:
  1. Run `/doc-changelog`.
- **Expected result**:
    - Assert `CHANGELOG.md` is created with an `## Unreleased` section
      containing Added/Changed/Fixed subsections that map to the actual
      commits (git log is the source).
    - Assert no duplicate subsections and no R&D-only entries
      (test/refactor noise collapsed or omitted).
- **Evidence**: `CHANGELOG.md`; `git log --oneline`.

## TC-DOC-02 — README, DEVELOPMENT, DEPLOYMENT (P2)

- **Objective**: Verify the three doc commands create their files for a
  library product type.
- **Verification**: file assertions of type-specific sections.
- **Preconditions**: scratch project (library shape: package.json, src/).
- **Steps**:
  1. `/doc-readme`, then `/doc-development`, then `/doc-deployment`.
- **Expected result**:
    - Assert `README.md` has install/usage sections fitting a library
      (import snippets, not deployment paragraphs).
    - Assert `DEVELOPMENT.md` has prerequisites, get-started, workflow,
      common tasks, troubleshooting.
    - Assert `DEPLOYMENT.md` covers env vars, infra dependencies, error
      reporting, logging (or states not applicable for a library).
- **Evidence**: the three files.

## TC-DOC-03 — AGENTS.md (P2)

- **Objective**: Verify `/doc-agents` generates an AGENTS.md with
  structure, commands, contribution rules, and code guidelines.
- **Verification**: file assertions.
- **Preconditions**: no `AGENTS.md` in the scratch project.
- **Steps**:
  1. Run `/doc-agents`.
- **Expected result**:
    - Assert `AGENTS.md` has Table of Contents, Project Structure, Build
      and Test Commands, Contribution Instructions, Code Guidelines.
    - Assert the System Design subsection matches a library type (from the
      `system-design-*` template variants).
- **Evidence**: `AGENTS.md` excerpt.

## TC-DOC-04 — Doc commands outside a git repo (P2)

- **Objective**: Verify graceful degradation when git history is absent.
- **Preconditions**: a scratch dir with source files but no `.git`
  (skip `scratch-init.sh`).
- **Steps**:
  1. `/doc-changelog`; then `/doc-readme`.
- **Expected result**:
    - Assert `/doc-changelog` either creates an Unreleased-only file or
      explains the missing git history; it must not crash the session.
    - Assert `/doc-readme` still works (it reads the repo tree, not git).
- **Evidence**: transcript; resulting files.
