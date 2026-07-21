import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createPatch } from 'diff';
import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parseTree,
  type FormattingOptions,
  type ParseError,
} from 'jsonc-parser';
import { applyAgentModels } from './agent-model-patch.js';

/**
 * The user's per-subagent model choices passed into {@link computePatch}.
 * When the selection is empty the patch registers only the plugin entry,
 * no per-subagent `model` assignments.
 *
 * The optional `models` map (subagent name -> `provider/model` value)
 * drives the per-subagent branch inside {@link computePatch}, which
 * delegates to `applyAgentModels` from {@link ./agent-model-patch.js}.
 * The empty-interface shape keeps the signature stable so a caller that
 * constructs `{}` does not change when models are added.
 */
export interface Selection {
  /**
   * Per-subagent model assignments (subagent name -> `provider/model`
   * value). Omitted or empty when no models are selected (probe failed,
   * or every agent went `unset`). Read by {@link computePatch}'s
   * per-subagent step, which delegates to `applyAgentModels` from
   * {@link ./agent-model-patch.js}.
   */
  readonly models?: ReadonlyMap<string, string>;
}

/**
 * The result of {@link computePatch}: the patched text (comments and
 * the relative key order of untouched nodes preserved by
 * `jsonc-parser.applyEdits`), `noChanges` — true iff the computed patch
 * is identical to the current text (the idempotency signal) — and
 * `diff` — a unified-diff string of `current` vs `patchedText`.
 *
 * `noChanges` is the canonical idempotency signal: it is `true` iff
 * `patchedText === current`. `applyPatch` short-circuits to a no-op
 * (writes nothing) when `noChanges` is `true`; `main` prints "no
 * changes" on the no-op path.
 *
 * `diff` is rendered by composing two editors: `jsonc-parser.applyEdits`
 * produces the patched text (comments and key order preserved), then
 * `diff.createPatch` renders `current`-vs-`patchedText` as a unified
 * diff. Because the patch is in-place, the hunk reflects only the
 * truly changed lines and never re-serializes untouched (possibly
 * commented) nodes. It is `''` when `noChanges` is `true` — a no-op
 * prints "no changes", never an empty diff with headers.
 */
export interface ComputedPatch {
  /** The patched source text (in-place `applyEdits` of `modify`'s edits). */
  readonly patchedText: string;
  /** `true` iff `patchedText === current` — the idempotency signal. */
  readonly noChanges: boolean;
  /**
   * Unified-diff string of `current` vs `patchedText` — `''` when
   * `noChanges` is `true`. Printed by the wizard as the preview/summary
   * before the write in every mode.
   */
  readonly diff: string;
}

/**
 * Formatting hints passed to `jsonc-parser.modify` when a new node is
 * created or appended (the `plugin` key/array, and any
 * `agent.<name>.model` nodes). Defaults match opencode's own config
 * formatting (2-space indent) so a newly-created `plugin` key on a
 * fresh project config matches what opencode would have written.
 */
interface PatcherFormatting {
  readonly tabSize: number;
  readonly insertSpaces: boolean;
}

/**
 * Optional inputs to {@link computePatch}. `formatting` overrides the
 * 2-space default; `targetPath` is included in error messages so the
 * user can tell which file failed to parse.
 */
export interface ComputeOptions {
  /** Override the default 2-space formatting for newly-created nodes. */
  readonly formatting?: PatcherFormatting;
  /** Included in malformed-JSONC error messages. */
  readonly targetPath?: string;
}

/** Default 2-space formatting (matches opencode's config style). */
const DEFAULT_FORMATTING: PatcherFormatting = {
  tabSize: 2,
  insertSpaces: true,
};

/** The plugin entry string appended to (or created in) the `plugin` array. */
const PLUGIN_ENTRY = 'opencode-sdd';

/**
 * Render a unified diff of `current` vs `patchedText`. Wraps
 * `diff.createPatch` (native ESM, zero-dep `diff@9.0.0`): the `fileName`
 * arg appears VERBATIM in the `Index: <fileName>` header and the
 * `--- <fileName>` / `+++ <fileName>` header pair (no `a/`/`b/` prefix —
 * empirically verified), so passing the resolved target path makes the
 * printed diff self-describing. Hunk lines preserve the original line's
 * leading indentation after the diff marker.
 *
 * Because {@link computePatch} produces `patchedText` via in-place
 * `jsonc-parser.applyEdits` (comments and key order preserved), the hunk
 * reflects only the truly changed lines: unchanged commented lines appear
 * as surrounding context, never re-serialized.
 *
 * Callers MUST short-circuit (`diff: ''`) when `patchedText === current`
 * — `createPatch` would otherwise emit a header-only diff on identical
 * input.
 */
function renderDiff(current: string, patchedText: string, fileName?: string): string {
  return createPatch(fileName ?? 'opencode.json', current, patchedText);
}

/**
 * Compute an idempotent patch that adds the `opencode-sdd` plugin entry
 * to the target's `plugin` array when absent (deduped — never appended
 * twice), and applies the per-subagent `model` assignments from
 * {@link Selection.models} when present. `current` is parsed with
 * `jsonc-parser.parseTree`, which natively accepts `//` and `/* *&#47;`
 * comments, trailing commas, and unquoted property names — so `.json`
 * and `.jsonc` are handled by the same code path.
 *
 * Comments and the relative key order of untouched nodes survive by
 * construction: `modify` produces a minimal edit list and `applyEdits`
 * patches the source text in place — untouched subtrees (including
 * adjacent comments) are never re-serialized.
 *
 * Idempotency: when the `plugin` array already contains `'opencode-sdd'`
 * and every selected model already equals the on-disk value, `modify` is
 * not called and `patchedText === current` — `noChanges` is `true`.
 *
 * Failure modes: malformed JSONC raises an `Error('malformed JSONC ...
 * <path>')` before any `modify` runs; the caller's top-level guard
 * surfaces it as `install: <message>` + exit 1.
 *
 * @throws Error when `current` is not parseable JSON/JSONC.
 */
export function computePatch(
  current: string,
  selection: Selection,
  options: ComputeOptions = {},
): ComputedPatch {
  const formatting: FormattingOptions = {
    ...DEFAULT_FORMATTING,
    ...options.formatting,
  };
  const pathQualifier = options.targetPath ? ` at ${options.targetPath}` : '';

  const errors: ParseError[] = [];
  const root = parseTree(current, errors, { disallowComments: false });
  if (root === undefined || errors.length > 0) {
    throw new Error(`malformed JSONC${pathQualifier} (${errors.length} parse error(s))`);
  }

  const pluginNode = findNodeAtLocation(root, ['plugin']);
  let patchedText: string;
  if (pluginNode === undefined) {
    // Top-level `plugin` key is absent — create it with
    // ['opencode-sdd']. `modify` inserts a new top-level key; the
    // default `getInsertionIndex` appends at the end of the existing
    // property list, preserving the relative order of existing keys.
    patchedText = applyEdits(
      current,
      modify(current, ['plugin'], [PLUGIN_ENTRY], {
        formattingOptions: formatting,
      }),
    );
  } else {
    const existingRaw = getNodeValue(pluginNode);
    const existing = Array.isArray(existingRaw) ? (existingRaw as unknown[]) : [];
    if (existing.includes(PLUGIN_ENTRY)) {
      // Idempotent: the plugin entry is already present — no edits,
      // `patchedText === current`.
      patchedText = current;
    } else {
      // Append at index === current length. `jsonc-parser` inserts the
      // new element at that index; existing entries (and any inline
      // comments on them) are byte-preserved.
      patchedText = applyEdits(
        current,
        modify(current, ['plugin', existing.length], PLUGIN_ENTRY, {
          formattingOptions: formatting,
        }),
      );
    }
  }

  // Step 2: per-subagent model step. Delegated to the sibling pure
  // module to keep config-patcher.ts under the 300-line max-lines gate.
  if (selection.models !== undefined && selection.models.size > 0) {
    patchedText = applyAgentModels(patchedText, selection.models, {
      formatting: options.formatting,
      targetPath: options.targetPath,
    }).patchedText;
  }

  const noChanges = patchedText === current;
  const diff = noChanges ? '' : renderDiff(current, patchedText, options.targetPath);
  return { patchedText, noChanges, diff };
}

/**
 * Optional dependencies of {@link applyPatch}. Tests inject an
 * `atomicWrite` callback that throws to deterministically simulate a
 * write failure without touching real filesystem permissions (the
 * canonical failure assertion — `chmod`-based perms tests are flaky
 * under CI root and on Windows, so injection is the portable path).
 * `defaultAtomicWrite` is the production binding.
 */
export interface ApplyDeps {
  /**
   * Override the atomic-write primitive (used by tests). Defaults to
   * {@link defaultAtomicWrite}.
   */
  readonly atomicWrite?: (targetPath: string, text: string) => void;
}

/**
 * The single end-of-run filesystem mutation: write the patched text to a
 * temp file in the target's directory, then atomically rename it over
 * the target. The temp lives in the same directory so the rename is a
 * same-directory, same-filesystem operation on POSIX (a cross-device
 * temp would throw `EXDEV`, which is not silent corruption — the
 * original is untouched and the temp is cleaned up before rethrowing).
 *
 * Interrupt safety is structural: the wizard installs no signal
 * handlers — the only write happens at the very end of the run, after
 * every prompt and computation has already succeeded. An interrupt
 * before that point lands on code paths that have written nothing. A
 * crash *during* this write lands on either the `writeFileSync` (temp
 * written, original intact) or the `renameSync` (rename either completed
 * or did not — atomic). Either way the target file is never half-written.
 *
 * On any failure path the temp file is removed with `rmSync(temp, {
 * force: true })` (best-effort, swallowed) before the original error
 * is rethrown, so a failed run leaves no `*.tmp.sdd-*` litter and the
 * original target is byte-for-byte unchanged.
 *
 * The temp name is `<basename>.tmp.sdd-<pid>` — the suffix avoids any
 * real config name, and the `pid` discriminates concurrent runs.
 *
 * @throws the underlying `node:fs` error on a write or rename failure
 *         (EACCES, EROFS, ENOSPC, ENOENT, EXDEV, ...). The caller's
 *         top-level guard surfaces it as `install: <message>` + exit 1.
 */
/**
 * @internal Exported for tests only (the `config-patcher-write.test.ts`
 * temp-then-rename contract test); `applyPatch` binds it as the default
 * `atomicWrite` via `??` — not tracked by knip's value-flow analysis.
 */
export function defaultAtomicWrite(targetPath: string, text: string): void {
  const dir = dirname(targetPath);
  const tempPath = join(dir, `${basename(targetPath)}.tmp.sdd-${process.pid}`);
  try {
    writeFileSync(tempPath, text, 'utf8');
    renameSync(tempPath, targetPath);
  } catch (error) {
    // Best-effort cleanup of the temp file so a failed write leaves
    // no litter. `force: true` swallows ENOENT (temp never created).
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // Swallow — the original error from `writeFileSync` or
      // `renameSync` is the actionable signal.
    }
    throw error;
  }
}

/**
 * Apply a {@link ComputedPatch} to `targetPath` by writing the patched
 * text atomically. Returns the written path on success, or `null` when
 * the patch is a no-op (`noChanges: true`) — in which case nothing is
 * written and the original target is untouched.
 *
 * Failures (the underlying `node:fs` write/rename error) propagate
 * out of `defaultAtomicWrite`; the original target is structurally
 * intact because the atomic write either landed or did not, never
 * partially. The caller's top-level guard surfaces the error as
 * `install: <message>` on stderr + exit 1.
 */
export function applyPatch(
  targetPath: string,
  patch: ComputedPatch,
  deps: ApplyDeps = {},
): string | null {
  if (patch.noChanges) {
    // Idempotent no-op: write nothing, signal `null` to the caller.
    return null;
  }
  const atomicWrite = deps.atomicWrite ?? defaultAtomicWrite;
  atomicWrite(targetPath, patch.patchedText);
  return targetPath;
}
