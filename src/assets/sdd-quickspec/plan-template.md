# Implementation Plan: [BRIEF TITLE]

- **Created**: [DATE]
- **Status**: Draft
- **Model**: [MODEL_NAME MODEL_VERSION THINKING_EFFORT]
- **Type**: [Bug Fix | Refactoring | Configuration | Documentation | Other]
- **Input**: [PROBLEM_DESCRIPTION provided by the user]

## Problem

[Clear description of what needs to be fixed or changed]

## Research Findings

[Summary of codebase analysis]

### Root Cause

[For bugs: explain why the issue occurs]
[For other tasks: explain current state and why change is needed]

### Patterns to Follow

[Coding conventions, similar implementations, test patterns found in
the codebase that the implementation should follow]

### Edge Cases

- [Boundary condition or related failure mode]
- [Input or state that could break the fix]

### Entities

<!--
  Include only if the task adds new functionality or changes existing
  entities. Remove this section for minor bug fixes and refactorings.
-->

- **[Entity]**: [Key attributes, relationships, validation rules]

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `path/to/file1.ext` | Create | [What this file does] |
| `path/to/file2.ext` | Modify | [What changes and why] |
| `path/to/test1.ext` | Create | [What it tests] |

## Solution

[Describe the proposed fix or change]

### Alternatives Considered

[Optional: other approaches and why they were not chosen]

## Tasks

[See Task Structure above for the format each task should follow]

## Final Verification

- [ ] Run full test suite: `[command]`
- [ ] Run linter: `[command]`
- [ ] Run type check: `[command]`
- [ ] [Any manual checks needed]

## Notes

[Optional: any additional context, risks, or considerations]
