@docs
Feature: Doc maintenance commands
  Smoke group: verify each doc command writes the right file with
  type-specific content. Runs on fixture F4 ("Update the docs of this
  scaffolding project."); P2 because output quality is model-dependent —
  run this group on the cheap default for mechanics, and re-run on a
  strong model (BIFROST_MODEL) when reviewing content quality.

Background:
  Given the scratch repo is at its initial commit
  And the LLM is up

@TC-DOC-01 @P2
Scenario: CHANGELOG maintenance
  Given I reset the scratch baseline first: qa exec '/app/qa/docker/reset-scratch.sh /work/sdd-manual'
  And the scratch repo has 2-3 commits since the initial one
  And no CHANGELOG.md exists
  When I run /doc-changelog
  Then CHANGELOG.md is created with an '## Unreleased' section containing Added/Changed/Fixed subsections that map to the actual commits (git log is the source)
  And there are no duplicate subsections and no R&D-only entries (test/refactor noise collapsed or omitted)
  And I keep CHANGELOG.md and git log --oneline in the evidence folder

@TC-DOC-02 @P2
Scenario: README, DEVELOPMENT, DEPLOYMENT
  Given the scratch project has a library shape (package.json, src/)
  When I run /doc-readme, then /doc-development, then /doc-deployment
  Then README.md has install/usage sections fitting a library (import snippets, not deployment paragraphs)
  And DEVELOPMENT.md has prerequisites, get-started, workflow, common tasks and troubleshooting
  And DEPLOYMENT.md covers env vars, infra dependencies, error reporting and logging (or states they are not applicable for a library)
  And I keep the three files in the evidence folder

@TC-DOC-03 @P2
Scenario: AGENTS.md
  Given no AGENTS.md exists in the scratch project
  When I run /doc-agents
  Then AGENTS.md has Table of Contents, Project Structure, Build and Test Commands, Contribution Instructions and Code Guidelines
  And the System Design subsection matches a library type (from the system-design-* template variants)
  And I keep an AGENTS.md excerpt in the evidence folder

@TC-DOC-04 @P2
Scenario: Doc commands outside a git repo
  Given a scratch dir with source files but no .git directory (skip scratch-init.sh)
  When I run /doc-changelog, then /doc-readme
  Then /doc-changelog either creates an Unreleased-only file or explains the missing git history — it must not crash the session
  And /doc-readme still works (it reads the repo tree, not git)
  And I keep the transcript and the resulting files in the evidence folder
