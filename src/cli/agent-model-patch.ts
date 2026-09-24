import {
  applyEdits,
  modify,
  parseTree,
  type FormattingOptions,
  type ParseError,
} from 'jsonc-parser';
import type { OpencodeHost } from './prerequisites.js';

/** Optional inputs to {@link applyAgentModels}. Mirrors ComputeOptions. */
export interface AgentModelOptions {
  /** Override the default 2-space formatting for newly-created nodes. */
  readonly formatting?: { readonly tabSize: number; readonly insertSpaces: boolean };
  /** Included in malformed-JSONC error messages. */
  readonly targetPath?: string;
  /**
   * Detected host line; selects the top-level agent map key (`agent` on V1,
   * `agents` on V2). Defaults to `v1`.
   */
  readonly host?: OpencodeHost;
}

/**
 * The top-level config key holding the agent map for a host line.
 *
 * @param host - Detected host line.
 * @returns `agents` on V2, `agent` on V1.
 */
function agentKeyFor(host: OpencodeHost): 'agent' | 'agents' {
  return host === 'v2' ? 'agents' : 'agent';
}

/** The result of {@link applyAgentModels}. */
export interface AgentModelPatchResult {
  /** The patched source text (in-place applyEdits of modify's edits). */
  readonly patchedText: string;
  /** `true` iff `patchedText !== currentText` (the per-agent idempotency signal). */
  readonly changed: boolean;
}

const DEFAULT_FORMATTING: FormattingOptions = {
  tabSize: 2,
  insertSpaces: true,
};

/**
 * Apply per-subagent `model` assignments to `currentText` via comment-
 * and order-preserving JSONC-safe edits.
 *
 * For each `[agentName, value]` in `models`, sets the agent's `model` field
 * (`agent.<agentName>.model` on V1, `agents.<agentName>.model` on V2):
 *   - creates the top-level agent-map key when absent;
 *   - creates the agent object when absent;
 *   - shallow-merges `model` into an existing agent object, preserving
 *     its non-`model` fields (the existing agent fields survive the
 *     overwrite).
 *
 * `jsonc-parser.modify` + `applyEdits` patch the source in place, so
 * untouched subtrees (comments, sibling agent fields, key order)
 * survive by construction for both `.json` and `.jsonc`.
 *
 * Idempotency: when every selected `value` already equals the current
 * on-disk value, no `modify` is emitted for that agent and the
 * `changed` signal is the OR of the per-agent deltas — `false` when
 * nothing changed.
 *
 * @throws Error('malformed JSONC ...') when `currentText` is not parseable.
 */
export function applyAgentModels(
  currentText: string,
  models: ReadonlyMap<string, string>,
  options: AgentModelOptions = {},
): AgentModelPatchResult {
  if (models.size === 0) {
    return { patchedText: currentText, changed: false };
  }
  const formatting: FormattingOptions = {
    ...DEFAULT_FORMATTING,
    ...options.formatting,
  };
  const pathQualifier = options.targetPath ? ` at ${options.targetPath}` : '';
  const errors: ParseError[] = [];
  const root = parseTree(currentText, errors, { disallowComments: false });
  if (root === undefined || errors.length > 0) {
    throw new Error(`malformed JSONC${pathQualifier} (${errors.length} parse error(s))`);
  }
  // Apply each modify() sequentially against the running patched text.
  // The jsonc-parser EditResult JSDoc explicitly warns: "multiple
  // EditResults must not be concatenated because they might impact each
  // other, producing incorrect or malformed JSON data."  Each modify(text,
  // path, value) computes its edit offsets against ITS input text; if
  // every modify() were computed against the same currentText and the
  // resulting EditResults were concatenated into a single applyEdits pass,
  // then after the first agent's edit landed the subsequent agents'
  // offsets would point at stale positions, yielding malformed JSON when
  // 2+ agents are patched.
  //
  // The safe pattern (mirrored from the existing config-patcher.ts
  // plugin-edit step — one modify() per applyEdits() call) is to thread
  // the running text through every modify() so each agent's offsets are
  // computed against the most-recent state. applyEdits(text, []) is a
  // no-op when modify() returns an empty EditResult (the value already
  // equals the on-disk value), so the idempotency contract holds.
  const agentKey = agentKeyFor(options.host ?? 'v1');
  let text = currentText;
  for (const [agentName, value] of models) {
    text = applyEdits(
      text,
      modify(text, [agentKey, agentName, 'model'], value, {
        formattingOptions: formatting,
      }),
    );
  }
  return { patchedText: text, changed: text !== currentText };
}
