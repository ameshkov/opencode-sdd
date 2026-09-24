import { describe, expect, it } from 'vitest';
import {
  hasRule,
  mapPermissionMap,
  mergeRules,
  sddCommandDenyRule,
  withTemplatesGrant,
} from './permissions.js';

describe('mapPermissionMap', () => {
  it('maps scalar effects to `*` resource rules', () => {
    expect(mapPermissionMap({ read: 'allow', edit: 'deny' })).toEqual([
      { action: 'read', resource: '*', effect: 'allow' },
      { action: 'edit', resource: '*', effect: 'deny' },
    ]);
  });

  it('aliases V1 action names to their V2 equivalents', () => {
    expect(
      mapPermissionMap({ bash: 'allow', task: { '*': 'deny', 'sdd-explore': 'allow' } }),
    ).toEqual([
      { action: 'shell', resource: '*', effect: 'allow' },
      { action: 'subagent', resource: '*', effect: 'deny' },
      { action: 'subagent', resource: 'sdd-explore', effect: 'allow' },
    ]);
  });

  it('keeps custom action names such as sdd-command', () => {
    expect(mapPermissionMap({ 'sdd-command': 'allow' })).toEqual([
      { action: 'sdd-command', resource: '*', effect: 'allow' },
    ]);
  });

  it('skips invalid entries instead of throwing', () => {
    expect(
      mapPermissionMap({
        read: 'maybe',
        write: 42,
        edit: { '*': 'nope', src: 'allow' },
      }),
    ).toEqual([{ action: 'edit', resource: 'src', effect: 'allow' }]);
  });

  it('returns an empty list for non-object input', () => {
    expect(mapPermissionMap(undefined)).toEqual([]);
    expect(mapPermissionMap(null)).toEqual([]);
    expect(mapPermissionMap('allow')).toEqual([]);
  });
});

describe('mergeRules', () => {
  it('drops existing rules overridden by added rules and appends the added ones', () => {
    const existing = [
      { action: 'read', resource: '*', effect: 'deny' as const },
      { action: 'edit', resource: '*', effect: 'allow' as const },
    ];
    const added = [{ action: 'read', resource: '*', effect: 'allow' as const }];

    expect(mergeRules(existing, added)).toEqual([
      { action: 'edit', resource: '*', effect: 'allow' },
      { action: 'read', resource: '*', effect: 'allow' },
    ]);
  });

  it('does not duplicate rules across repeated merges', () => {
    const added = [{ action: 'read', resource: '*', effect: 'allow' as const }];
    const once = mergeRules([], added);
    expect(mergeRules(once, added)).toEqual(once);
  });
});

describe('hasRule', () => {
  it('detects a rule by action', () => {
    expect(hasRule([{ action: 'sdd-command', resource: '*', effect: 'deny' }], 'sdd-command')).toBe(
      true,
    );
    expect(hasRule([], 'sdd-command')).toBe(false);
  });
});

describe('sddCommandDenyRule', () => {
  it('builds a `*` deny rule that excludes the tool from the snapshot', () => {
    expect(sddCommandDenyRule()).toEqual({
      action: 'sdd-command',
      resource: '*',
      effect: 'deny',
    });
  });
});

describe('withTemplatesGrant', () => {
  it('appends an external_directory allow rule for the templates dir', () => {
    expect(withTemplatesGrant([], '/opt/templates')).toEqual([
      { action: 'external_directory', resource: '/opt/templates/*', effect: 'allow' },
    ]);
  });
});
