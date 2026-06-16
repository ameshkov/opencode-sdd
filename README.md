# opencode-sdd

**Specification-Driven Development for OpenCode.**

You describe what you want in vague terms.
The plugin produces a complete, validated development plan — PRD, issues,
implementation plans, and validation reports — with every phase running in a
clean, isolated session.

## The Problem

AI coding agents are great at writing code.
They’re terrible at *planning* code.

You tell an agent “build a payment system” and it starts typing.
No requirements. No architecture.
No validation. By the time you realize it built the wrong thing, you’ve burned a
session full of context and a pile of tokens.

Manually writing PRDs and breaking down issues is slow.
Chaining prompts across sessions is fragile.
And every time you paste the previous step’s output into a new conversation,
something gets lost.

## The Solution

**opencode-sdd** inverts the workflow: *plan everything before you build
anything.*
