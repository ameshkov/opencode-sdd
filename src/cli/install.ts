#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from './argv.js';
import {
  applyPatch,
  computePatch,
  defaultAtomicWrite,
  type ComputedPatch,
  type Selection,
} from './config-patcher.js';
import {
  enumerateCandidates,
  pickDefault,
  type Candidate,
  type ResolverEnv,
} from './config-resolver.js';
import { promptTarget } from './target-select.js';
import { detect, INSTALL_OPENCODE_HINT, type DetectResult } from './prerequisites.js';
import { USAGE_TEXT } from './usage.js';
import { buildYesSelection, type YesSelectionResult } from './yes-selection.js';
import { confirmPatch as confirmPatchFn } from './confirm-patch.js';
import {
  buildInteractiveSelection,
  type InteractiveSelectionResult,
} from './interactive-selection.js';

/**
 * Printed to stderr (and the run exits 0) when no patchable target is
 * discoverable. The non-zero exit + "create-one" guidance is wired into
 * the `--yes` path; the interactive flow instead offers the create-new
 * fallback.
 */
const NO_RESOLVABLE_TARGET_HINT =
  'install: no resolvable target config. Create one or point OPENCODE_CONFIG at one and re-run.';

/** Printed to stderr when the user cancels at the target prompt. */
const NO_TARGET_SELECTED_HINT = 'install: no target selected.';

/** Printed to stdout on a no-op run. */
const NO_CHANGES_MESSAGE = 'install: no changes.';

/** Printed to stderr when the user declines at the confirmation gate. */
const DECLINED_HINT = 'install: declined; no file written.';

/**
 * The conventional project-local opencode config filename written by
 * the create-new path. The wizard writes `<cwd>/opencode.json` — not
 * `.jsonc` — because the minimal skeleton is plain JSON (no comments
 * needed). A re-run discovers this file via `enumerateCandidates` when
 * `<cwd>` is a `.git`-bearing repo root.
 */
const CREATE_NEW_CONFIG_FILENAME = 'opencode.json';

/**
 * The minimal valid JSON skeleton written first by the create-new path.
 * Valid JSON (not JSONC — kept minimal) and parseable by
 * `jsonc-parser.parseTree`, so the subsequent `computePatch` call (via
 * `applyConfigPatch`) reads + patches it through the same JSONC-safe
 * writer as an edit-existing run. The `plugin` array already contains
 * `'opencode-sdd'`, so the patcher's plugin-edit step is a no-op
 * against this skeleton — only the per-subagent `model` assignments
 * (via `applyAgentModels`) produce a diff. A minimal valid skeleton is
 * written first and then patched by the same code path that edits
 * existing files, so creation and editing share one JSONC-safe writer.
 */
const CREATE_NEW_SKELETON = `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sdd"],
  "agent": {}
}`;

/**
 * Optional dependencies of {@link main}, used to inject test doubles.
 * In production all bindings default to the real implementations.
 */
export interface MainDeps {
  /** Override the prerequisites probe (used by tests). */
  detect?: () => DetectResult;
  /** Override candidate discovery (used by tests). */
  enumerateCandidates?: (env: ResolverEnv) => Candidate[];
  /** Override the target-config prompt (used by tests). */
  promptTarget?: (candidates: readonly Candidate[]) => Promise<Candidate | null>;
  /**
   * Override the atomic-write primitive for the resolved target (used
   * by tests to inject a write failure). Defaults to the patcher's
   * `defaultAtomicWrite` (write-temp-then-rename).
   */
  writeTarget?: (targetPath: string, text: string) => void;
  /**
   * Override the `--yes` model-selection orchestrator (used by tests to
   * inject a canned {@link YesSelectionResult} without spawning the real
   * opencode probe). Defaults to {@link buildYesSelection}.
   */
  selectYesModels?: () => Promise<YesSelectionResult>;
  /**
   * Override the interactive model-selection orchestrator (used by tests
   * to inject a canned {@link InteractiveSelectionResult} without
   * spawning the real opencode probe or per-agent prompts). Defaults to
   * {@link buildInteractiveSelection}.
   */
  selectInteractiveModels?: () => Promise<InteractiveSelectionResult>;
  /**
   * Override the confirmation gate (used by tests). Defaults to
   * {@link confirmPatch}. Under `--yes` the gate is NOT invoked; in the
   * interactive flow it fires between the diff preview and the
   * single end-of-run write. The gate takes no argument — the diff has
   * already been printed by `applyConfigPatch`.
   */
  confirmPatch?: () => Promise<boolean>;
}

/**
 * Build the resolver env from the live process at call time (never
 * captured at import time) so behaviour is deterministic per run.
 * Extracted from {@link main} as a named helper so `main` stays a
 * thin dispatch over phases under the AGENTS.md 50-line function
 * SHOULD. Reads the process only — no filesystem I/O, no throws.
 */
function buildResolverEnv(): ResolverEnv {
  return {
    cwd: process.cwd(),
    env: { ...process.env },
    homedir: homedir(),
    platform: platform(),
  };
}

/**
 * Pick the default target under `--yes` (non-interactive) or prompt
 * the user interactively. Returns `null` when no target is selected
 * (Ctrl-C on the prompt maps to `null` via {@link promptTarget}'s
 * narrowed catch). Extracted from {@link main} so the dispatch over
 * the `yes` flag is testable in isolation and `main` stays a thin
 * orchestrator under the AGENTS.md 50-line function SHOULD. Pure
 * dispatch over already-enumerated candidates — reads neither the
 * process nor the filesystem.
 */
async function pickOrPromptTarget(
  candidates: readonly Candidate[],
  deps: MainDeps,
  yes: boolean,
): Promise<Candidate | null> {
  if (yes) {
    // --yes resolves the default target non-interactively. The full
    // --yes spine (auto-select models, gate skip, write-through) is
    // wired into `buildModelSelection` + `applyConfigPatch` below.
    return pickDefault(candidates);
  }
  return (deps.promptTarget ?? promptTarget)(candidates);
}

/**
 * Read the resolved target's current text, compute the idempotent
 * patch, print the diff preview, optionally gate on user confirmation,
 * and apply atomically. Returns the process exit status: 0 on success,
 * no-op, or user decline; 1 on a read or write failure.
 *
 * The optional `confirm` gate fires between the diff preview and the
 * atomic write. Under `--yes` the caller passes no `confirm` (the gate
 * is skipped); in the interactive flow the caller passes
 * `deps.confirmPatch ?? confirmPatchFn`. The gate takes no argument —
 * the diff was already printed above as the preview. Decline -> no
 * write, exit 0. The no-op short-circuit (`patch.noChanges`) runs
 * BEFORE the gate, so an idempotent re-run never prompts.
 */
async function applyConfigPatch(
  target: Candidate,
  deps: MainDeps,
  selection: Selection,
  confirm?: () => Promise<boolean>,
): Promise<number> {
  let currentText: string;
  try {
    currentText = readFileSync(target.path, 'utf8');
  } catch (error) {
    console.error(`install: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const patch: ComputedPatch = computePatch(currentText, selection, {
    targetPath: target.path,
  });

  if (patch.noChanges) {
    // No-op path: print "no changes" to stdout, exit 0. The diff
    // field is '' on a no-op (never printed here).
    console.log(NO_CHANGES_MESSAGE);
    return 0;
  }

  // Print the unified diff to stdout BEFORE the write. In interactive
  // mode this is the diff preview (before the gate); under --yes it is
  // the applied-changes summary before the write.
  console.log(patch.diff);

  if (confirm !== undefined && !(await confirm())) {
    // User declined (or Ctrl-C at the gate, which `confirmPatch`
    // narrows to `false`) — no write, exit 0.
    console.error(DECLINED_HINT);
    return 0;
  }

  const writeTarget = deps.writeTarget;
  const written = applyPatch(target.path, patch, {
    ...(writeTarget === undefined ? {} : { atomicWrite: writeTarget }),
  });
  // `written` is non-null here (noChanges is false above, so applyPatch
  // does not short-circuit to null); the diff above is the run's record.
  void written;
  return 0;
}

/**
 * Build the per-subagent model selection and gate. Under `--yes` it's
 * probe -> autoSelect -> format -> warnings, no gate. Under the
 * interactive flow it's probe -> per-agent prompt -> format ->
 * warnings + gate. Both return the same shape so `main` treats them
 * uniformly. Extracted from {@link main} to keep the function under
 * the 50-line limit.
 */
async function buildModelSelection(
  yes: boolean,
  deps: MainDeps,
): Promise<{ selection: Selection; confirm: (() => Promise<boolean>) | undefined }> {
  let selection: Selection;
  let confirm: (() => Promise<boolean>) | undefined;
  if (yes) {
    const modelsResult = await (deps.selectYesModels ?? buildYesSelection)();
    for (const warning of modelsResult.warnings) {
      console.error(warning);
    }
    selection = modelsResult.selection;
    confirm = undefined;
  } else {
    const modelsResult = await (deps.selectInteractiveModels ?? buildInteractiveSelection)();
    for (const warning of modelsResult.warnings) {
      console.error(warning);
    }
    selection = modelsResult.selection;
    confirm = deps.confirmPatch ?? confirmPatchFn;
  }
  return { selection, confirm };
}

/**
 * The interactive create-new config fallback: when
 * {@link enumerateCandidates} returns `[]` and `--yes` is NOT set,
 * build a synthetic `'create'` {@link Candidate} at
 * `<cwd>/opencode.json`, offer it as the only choice via the existing
 * {@link promptTarget} / `selectTarget` wrapper (no new prompt module),
 * and on acceptance write the {@link CREATE_NEW_SKELETON} via the SAME
 * atomic-write primitive as {@link applyPatch}
 * (`deps.writeTarget ?? defaultAtomicWrite` — no duplicated write
 * logic). Returns the synthetic candidate so the caller can dispatch
 * the patched version (skeleton + per-subagent models) through the
 * existing {@link applyConfigPatch} path — creation and editing share
 * one JSONC-safe writer.
 *
 * The synthetic candidate's path is `join(cwd, CREATE_NEW_CONFIG_FILENAME)`;
 * tests inject {@link MainDeps.promptTarget} to override the returned
 * path (so the test controls where on disk the skeleton lands without
 * touching `process.cwd()`).
 *
 * Returns `null` when the user declines the create-new choice
 * (`promptTarget` returns null on a Ctrl-C / cancel) — `main` then
 * prints {@link NO_TARGET_SELECTED_HINT} and exits 0.
 */
async function createNewConfig(cwd: string, deps: MainDeps): Promise<Candidate | null> {
  const synthetic: Candidate = {
    source: 'create',
    path: join(cwd, CREATE_NEW_CONFIG_FILENAME),
  };
  const accepted = await (deps.promptTarget ?? promptTarget)([synthetic]);
  if (accepted === null) {
    return null;
  }
  // Write the skeleton via the SAME atomic-write primitive `applyPatch`
  // uses; `main`'s `applyConfigPatch` reads the skeleton back from disk
  // and patches it (plugin is already in the skeleton -> no-op; agent
  // models added via applyAgentModels) through the same `applyPatch`
  // path. Two atomic writes on the create-new path (skeleton, then
  // patched) — the wizard explicitly carves out this trade-off ("a
  // minimal valid skeleton is written first and then patched by the
  // same code path that edits existing files").
  const writeTarget = deps.writeTarget ?? defaultAtomicWrite;
  writeTarget(accepted.path, CREATE_NEW_SKELETON);
  return accepted;
}

/**
 * Run the CLI with the given argv (excluding `node` and the script
 * path). Returns the process exit status. Never throws; any phase
 * error is translated into a non-zero exit with a message. The phase
 * dispatch is wrapped in a top-level `try`/`catch` so an unexpected
 * throw (e.g. a rethrown non-Ctrl-C `promptTarget` failure) is logged
 * to stderr as `install: <message>` and translated to exit 1 rather
 * than escaping as an unhandled rejection.
 *
 * The spine is: parse argv -> detect opencode -> resolve target
 * (interactive prompt or `--yes` default) -> print the resolved path
 * -> read + compute + apply the patcher dispatch. With `--yes` +
 * no-config the wizard exits non-zero and writes nothing (create-new
 * is a user choice, never a non-interactive default). In the
 * interactive flow with no existing config the create-new fallback
 * offers to write `<cwd>/opencode.json` and patches it through this
 * same spine.
 */
export async function main(argv: string[], deps: MainDeps = {}): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (!parsed.ok) {
      console.error(USAGE_TEXT);
      return 1;
    }

    const { subcommand, help, yes } = parsed.args;
    if (help) {
      console.log(USAGE_TEXT);
      return 0;
    }

    if (subcommand !== 'install') {
      console.error(USAGE_TEXT);
      return 1;
    }

    const detected = (deps.detect ?? detect)();
    if (!detected.ok) {
      console.error(INSTALL_OPENCODE_HINT);
      return 1;
    }

    console.log(`opencode ${detected.version} detected`);

    const candidates = (deps.enumerateCandidates ?? enumerateCandidates)(buildResolverEnv());
    if (candidates.length === 0 && yes) {
      // --yes + no resolvable config -> exit non-zero, writes nothing.
      // create-new is a user choice, NOT a non-interactive default (the
      // --yes path never auto-creates).
      console.error(NO_RESOLVABLE_TARGET_HINT);
      return 1;
    }

    let target: Candidate | null;
    if (candidates.length === 0) {
      // Interactive create-new fallback. Offer the synthetic create-new
      // candidate (at `<cwd>/opencode.json`) via the existing
      // promptTarget wrapper; on accept, write the minimal skeleton via
      // the same atomic-write primitive as applyPatch. On decline
      // (Ctrl-C at the create-new prompt), falls through to the
      // NO_TARGET_SELECTED_HINT + exit 0 path below.
      target = await createNewConfig(buildResolverEnv().cwd, deps);
    } else {
      target = await pickOrPromptTarget(candidates, deps, yes);
    }
    if (target === null) {
      // Cancel at the prompt (Ctrl-C -> null) — exit 0 per the exit
      // -status policy. This branch fires on both the interactive
      // edit-existing cancel and the create-new decline.
      console.error(NO_TARGET_SELECTED_HINT);
      return 0;
    }

    // Print the resolved target's absolute path to stdout in every
    // mode (interactive, --yes, create-new).
    console.log(target.path);

    const { selection, confirm } = await buildModelSelection(yes, deps);
    return await applyConfigPatch(target, deps, selection, confirm);
  } catch (error) {
    // Top-level guard: any phase error -> non-zero exit with a message.
    // `promptTarget` rethrows non-Ctrl-C failures; this catch surfaces
    // them as `install: <message>` on stderr and exit 1 instead of
    // escaping as an unhandled rejection.
    console.error(`install: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// Bin entry: only run when invoked directly as the script, never on
// import (so unit tests can call `main` without exiting the process).
// `main` is async, so `.then` maps the resolved exit code to
// `process.exit`; the previous synchronous `process.exit(main(...))`
// would have coerced the Promise to NaN.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
