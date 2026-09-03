import { describe, expect, it } from 'vitest';
import { computePatch, type ComputedPatch, type Selection } from './config-patcher.js';

const EMPTY_SELECTION: Selection = {};

describe('computePatch — per-subagent model delegation', () => {
  it('applies both the plugin entry and per-subagent models in one patch', () => {
    const current = `{
  "$schema": "https://opencode.ai/config.json"
}`;
    const selection: Selection = {
      models: new Map([
        ['sdd-coder', 'anthropic/claude-3-5-sonnet'],
        ['sdd-explore', 'openai/gpt-4o-mini'],
      ]),
    };
    const { patchedText, noChanges, diff } = computePatch(current, selection);
    expect(noChanges).toBe(false);
    const parsed = JSON.parse(patchedText) as {
      plugin: string[];
      agent: Record<string, { model: string }>;
    };
    expect(parsed.plugin).toEqual(['opencode-sdd']);
    expect(parsed.agent['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
    expect(parsed.agent['sdd-explore'].model).toBe('openai/gpt-4o-mini');
    // The diff covers BOTH the added plugin line and the agent-model lines.
    expect(diff).toContain('"opencode-sdd"');
    expect(diff).toContain('"anthropic/claude-3-5-sonnet"');
    expect(diff).toContain('"openai/gpt-4o-mini"');
  });

  it('is a no-op when the plugin is present and all models already match', () => {
    const current = `{
  "plugin": ["opencode-sdd"],
  "agent": {
    "sdd-coder": { "model": "anthropic/claude-3-5-sonnet" }
  }
}`;
    const selection: Selection = {
      models: new Map([['sdd-coder', 'anthropic/claude-3-5-sonnet']]),
    };
    const { patchedText, noChanges, diff } = computePatch(current, selection);
    expect(noChanges).toBe(true);
    expect(patchedText).toBe(current);
    expect(diff).toBe('');
  });

  it('patches only the changed model on a re-run upgrade', () => {
    const current = `{
  "plugin": ["opencode-sdd"],
  "agent": {
    "sdd-coder": { "model": "old/coder" },
    "sdd-explore": { "model": "openai/gpt-4o-mini" }
  }
}`;
    const selection: Selection = {
      models: new Map([
        ['sdd-coder', 'anthropic/claude-3-5-sonnet'],
        ['sdd-explore', 'openai/gpt-4o-mini'],
      ]),
    };
    const { noChanges, diff } = computePatch(current, selection);
    expect(noChanges).toBe(false);
    // Diff contains the sdd-coder change but NOT a sdd-explore change
    // (already equal — untouched).
    expect(diff).toMatch(/-.*"old\/coder"/m);
    expect(diff).toMatch(/^\+.*"anthropic\/claude-3-5-sonnet"/m);
    expect(diff).not.toMatch(/^-.*"openai\/gpt-4o-mini"/m);
    expect(diff).not.toMatch(/^\+.*"openai\/gpt-4o-mini"/m);
  });
});

describe('computePatch — plugin added when absent', () => {
  it('creates the top-level plugin key with ["opencode-sdd"] when missing', () => {
    const current = `{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude"
}`;
    const { patchedText, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(false);
    // The patched text parses as valid JSON and contains the plugin array.
    const parsed = JSON.parse(patchedText) as { plugin?: string[] };
    expect(parsed.plugin).toEqual(['opencode-sdd']);
    // Existing top-level keys keep their relative order: $schema before
    // model, and plugin is appended at the end.
    const keys = Object.keys(parsed);
    expect(keys.indexOf('$schema')).toBeLessThan(keys.indexOf('model'));
    expect(keys.indexOf('plugin')).toBeGreaterThan(keys.indexOf('model'));
  });

  it('preserves existing top-level keys when creating plugin (key-order)', () => {
    // Intentional non-alphabetical order — must survive the patch.
    const current = `{
  "model": "anthropic/claude",
  "$schema": "https://opencode.ai/config.json",
  "agent": {}
}`;
    const { patchedText } = computePatch(current, EMPTY_SELECTION);
    const parsed = JSON.parse(patchedText) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['model', '$schema', 'agent', 'plugin']);
  });
});

describe('computePatch — plugin appended to existing array', () => {
  it('appends opencode-sdd at the end of an existing plugin array', () => {
    const current = `{
  "plugin": [
    "other-plugin"
  ]
}`;
    const { patchedText, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(false);
    const parsed = JSON.parse(patchedText) as { plugin: string[] };
    expect(parsed.plugin).toEqual(['other-plugin', 'opencode-sdd']);
  });

  it('appends opencode-sdd to an array that has comments on its entries', () => {
    // A commented .jsonc with an existing plugin array — comments on
    // existing entries MUST survive.
    const current = `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    // a hand-pinned plugin
    "other-plugin"
  ]
}`;
    const { patchedText } = computePatch(current, EMPTY_SELECTION);
    // The hand-pinned comment survives.
    expect(patchedText).toContain('// a hand-pinned plugin');
    // And the new entry is appended.
    expect(patchedText).toContain('"opencode-sdd"');
  });
});

describe('computePatch — idempotency', () => {
  it('is a no-op when opencode-sdd is already the only plugin entry', () => {
    const current = `{
  "plugin": [
    "opencode-sdd"
  ]
}`;
    const { patchedText, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(true);
    expect(patchedText).toBe(current); // byte-for-byte unchanged
  });

  it('is a no-op when opencode-sdd is already present among others', () => {
    const current = `{
  "plugin": [
    "opencode-sdd",
    "another-plugin"
  ]
}`;
    const { patchedText, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(true);
    expect(patchedText).toBe(current);
  });

  it('is a no-op when the plugin key is present and the selection is empty', () => {
    // Locks the no-op contract: if `computePatch` decides no `modify`
    // is needed, `patchedText === current` exactly.
    const current = `{
  "plugin": ["opencode-sdd"],
  "agent": {}
}`;
    const { patchedText, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(true);
    expect(patchedText).toBe(current);
  });
});

describe('computePatch — comment and formatting preservation', () => {
  it('preserves line + block comments and the relative key order of a .jsonc', () => {
    const current = `{
  // top-of-file comment
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude", /* trailing block comment */
  "plugin": [
    "other"
  ],
  "agent": {
    // an agent comment
    "sdd-planner": {}
  }
}`;
    const { patchedText, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(false);
    // Every comment survives — untouched nodes are byte-preserved.
    expect(patchedText).toContain('// top-of-file comment');
    expect(patchedText).toContain('/* trailing block comment */');
    expect(patchedText).toContain('// an agent comment');
    // The plugin array gained the opencode-sdd entry, and the other entry
    // survives in its original position with its original formatting.
    const pluginBracket = patchedText.indexOf('"plugin":');
    expect(pluginBracket).toBeGreaterThan(0);
    expect(patchedText).toContain('"other"');
    expect(patchedText).toContain('"opencode-sdd"');
    // Top-level key order is preserved: $schema before model before
    // plugin before agent.
    const schemaIdx = patchedText.indexOf('"$schema"');
    const modelIdx = patchedText.indexOf('"model"');
    const pluginIdx = patchedText.indexOf('"plugin"');
    const agentIdx = patchedText.indexOf('"agent"');
    expect(schemaIdx).toBeLessThan(modelIdx);
    expect(modelIdx).toBeLessThan(pluginIdx);
    expect(pluginIdx).toBeLessThan(agentIdx);
  });

  it('produces valid JSON for a plain .json file', () => {
    const current = `{"$schema":"https://opencode.ai/config.json"}`;
    const { patchedText } = computePatch(current, EMPTY_SELECTION);
    const parsed = JSON.parse(patchedText) as {
      $schema: string;
      plugin: string[];
    };
    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    expect(parsed.plugin).toEqual(['opencode-sdd']);
  });
});

describe('computePatch — custom plugin entry', () => {
  it('creates the plugin key with a custom entry when absent', () => {
    const current = `{
  "$schema": "x"
}`;
    const { patchedText, noChanges } = computePatch(current, EMPTY_SELECTION, {
      pluginEntry: 'opencode-sdd@canary',
      pluginExplicit: true,
    });
    expect(noChanges).toBe(false);
    const parsed = JSON.parse(patchedText) as { plugin: string[] };
    expect(parsed.plugin).toEqual(['opencode-sdd@canary']);
  });

  it('is a no-op when the custom entry is already present (exact match)', () => {
    const current = `{
  "plugin": ["opencode-sdd@canary"]
}`;
    const { patchedText, noChanges, pluginEntryNote } = computePatch(current, EMPTY_SELECTION, {
      pluginEntry: 'opencode-sdd@canary',
    });
    expect(noChanges).toBe(true);
    expect(patchedText).toBe(current);
    expect(pluginEntryNote).toBeUndefined();
  });

  it('replaces a different opencode-sdd reference when the entry is explicit', () => {
    const current = `{
  "plugin": ["other-plugin", "opencode-sdd"]
}`;
    const { patchedText, noChanges } = computePatch(current, EMPTY_SELECTION, {
      pluginEntry: 'opencode-sdd@canary',
      pluginExplicit: true,
    });
    expect(noChanges).toBe(false);
    const parsed = JSON.parse(patchedText) as { plugin: string[] };
    expect(parsed.plugin).toEqual(['other-plugin', 'opencode-sdd@canary']);
  });

  it('replaces in place and preserves comments on untouched sibling entries', () => {
    const current = `{
  "plugin": [
    "other-plugin", // keep me
    "opencode-sdd"
  ]
}`;
    const { patchedText } = computePatch(current, EMPTY_SELECTION, {
      pluginEntry: 'opencode-sdd@canary',
      pluginExplicit: true,
    });
    // The comment on the untouched sibling entry survives, and the pinned
    // entry replaced the bare one at its original position.
    expect(patchedText).toContain('// keep me');
    expect(patchedText).toContain('"opencode-sdd@canary"');
  });

  it('auto-upgrades a bare reference to the pin without explicit flags', () => {
    const current = `{
  "plugin": ["opencode-sdd"]
}`;
    const { patchedText, pluginEntryNote } = computePatch(current, EMPTY_SELECTION, {
      pluginEntry: 'opencode-sdd@canary',
    });
    const parsed = JSON.parse(patchedText) as { plugin: string[] };
    expect(parsed.plugin).toEqual(['opencode-sdd@canary']);
    expect(pluginEntryNote).toBeUndefined();
  });

  it('keeps a pinned reference unchanged under the automatic default and surfaces a note', () => {
    const current = `{
  "plugin": ["opencode-sdd@canary"]
}`;
    const { patchedText, noChanges, pluginEntryNote } = computePatch(current, EMPTY_SELECTION, {
      pluginEntry: 'opencode-sdd',
    });
    expect(noChanges).toBe(true);
    expect(patchedText).toBe(current);
    expect(pluginEntryNote).toContain("'opencode-sdd@canary'");
    expect(pluginEntryNote).toContain("'opencode-sdd'");
  });

  it('keeps existing and notes ambiguity when multiple opencode-sdd references exist', () => {
    const current = `{
  "plugin": ["opencode-sdd", "opencode-sdd@canary"]
}`;
    const { noChanges, pluginEntryNote } = computePatch(current, EMPTY_SELECTION, {
      pluginEntry: 'opencode-sdd@1.2.0',
      pluginExplicit: true,
    });
    expect(noChanges).toBe(true);
    expect(pluginEntryNote).toContain("'opencode-sdd@1.2.0'");
  });
});

describe('computePatch — failure modes', () => {
  it('throws a clear error when the source is malformed JSONC', () => {
    // Broken: array literal is not closed.
    const malformed = `{ "plugin": [ }`;
    expect(() => computePatch(malformed, EMPTY_SELECTION)).toThrow(/malformed JSONC/i);
  });

  it('includes the target path in the error message when provided', () => {
    const malformed = `{ "plugin": [ }`;
    expect(() =>
      computePatch(malformed, EMPTY_SELECTION, {
        targetPath: '/repo/opencode.jsonc',
      }),
    ).toThrow(/\/repo\/opencode\.jsonc/);
  });
});

describe('Selection export', () => {
  it('accepts an optional models map', () => {
    // Type-level smoke: Selection carries the per-subagent model map;
    // the empty-shape fallback (`{}`) is still acceptable.
    const empty: Selection = {};
    expect(empty).toEqual({});
    const withModels: Selection = { models: new Map() };
    expect(withModels.models).toBeDefined();
  });

  it('exports ComputedPatch with patchedText + noChanges + diff', () => {
    // Type-level smoke: the return shape is what `applyPatch` consumes
    // and what `main` prints as the preview/summary.
    const result: ComputedPatch = {
      patchedText: '{}',
      noChanges: true,
      diff: '',
    };
    expect(result.patchedText).toBe('{}');
    expect(result.noChanges).toBe(true);
    expect(result.diff).toBe('');
  });
});

describe('computePatch — diff rendering', () => {
  it('renders a unified diff for a plugin-add change', () => {
    // Fixture: $schema + model.  Appending `plugin` after `model` adds
    // a trailing comma to `model` (so `model` becomes a -/+ change
    // pair), while `$schema` (NOT the last property) is genuinely
    // untouched context above the change.
    const current = `{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude"
}`;
    const { diff, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(false);
    // Empirically verified `diff@9.0.0` `createPatch` output: an
    // `Index:` header + `===` separator precede the `---`/`+++` headers;
    // NO `a/`/`b/` prefix (Git convention is NOT used by createPatch).
    expect(diff).toContain('Index: opencode.json');
    expect(diff).toContain('--- opencode.json');
    expect(diff).toContain('+++ opencode.json');
    // Hunk marker.
    expect(diff).toContain('@@');
    // The added line: `opencode-sdd` appears as `+    "opencode-sdd"`
    // (4 spaces between the `+` marker and the content — the original
    // line's indentation is preserved VERBATIM after the diff marker).
    expect(diff).toMatch(/^\+.*"opencode-sdd"/m);
    // Unchanged context: the existing `$schema` line survives as a
    // space-prefixed context line (not re-serialized as +/-) because
    // it is NOT the element `plugin` is inserted after (that element
    // is `model`, which takes the trailing comma and becomes -/+).
    expect(diff).toMatch(/^\s+"\$schema"/m);
  });

  it('includes the resolved target path in the diff header when provided', () => {
    const current = `{
  "$schema": "x"
}`;
    const { diff } = computePatch(current, EMPTY_SELECTION, {
      targetPath: '/repo/opencode.json',
    });
    // The `fileName` arg appears VERBATIM in `Index:`, `---`, and `+++`
    // headers (no `a/`/`b/` prefix, no path mangling).
    expect(diff).toContain('Index: /repo/opencode.json');
    expect(diff).toContain('--- /repo/opencode.json');
    expect(diff).toContain('+++ /repo/opencode.json');
  });

  it('preserves commented lines as surrounding context, not re-serialized', () => {
    // A commented .jsonc with an existing plugin array — the comment
    // is adjacent to the appended opencode-sdd entry, so it falls
    // inside createPatch's default 4-line context window.
    const current = `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    // a hand-pinned plugin
    "other-plugin"
  ]
}`;
    const { diff, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(false);
    // The added opencode-sdd entry appears as `+    "opencode-sdd"`
    // (4-space indentation preserved after the `+` marker).
    expect(diff).toMatch(/^\+.*"opencode-sdd"/m);
    // The hand-pinned comment survives as a context line — the original
    // 4-space indent is preserved after the diff context-space marker,
    // so it appears as `     // a hand-pinned plugin` (5 leading chars:
    // 1 diff marker space + 4 original spaces).  Commented lines shown
    // as surrounding context, not re-serialized.
    expect(diff).toMatch(/^\s+\/\/ a hand-pinned plugin/m);
    // And it was NOT deleted (no - line for the comment).
    expect(diff).not.toMatch(/^-.*\/\/ a hand-pinned plugin/m);
    // The `$schema` line is genuine context here (it is NOT the element
    // `opencode-sdd` is inserted after — that's `other-plugin`, which
    // gets a trailing comma and appears as a -/+ pair).
    expect(diff).toMatch(/^\s+"\$schema"/m);
    // `other-plugin` IS changed (comma added) — it appears as a -/+
    // pair, NOT as pure context. Proves the diff reflects the truly
    // changed lines.
    expect(diff).toMatch(/^-.*"other-plugin"/m);
  });

  it('returns an empty diff string on a no-op', () => {
    const current = `{
  "plugin": [
    "opencode-sdd"
  ]
}`;
    const { diff, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(true);
    // Empty diff — the wizard prints "no changes", never an empty
    // diff with headers.
    expect(diff).toBe('');
  });

  it('returns an empty diff string when the plugin is already present among others', () => {
    const current = `{
  "plugin": [
    "opencode-sdd",
    "another-plugin"
  ]
}`;
    const { diff, noChanges } = computePatch(current, EMPTY_SELECTION);
    expect(noChanges).toBe(true);
    expect(diff).toBe('');
  });
});
