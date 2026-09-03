import { describe, expect, it } from 'vitest';
import { parseArgs } from './argv.js';

describe('parseArgs', () => {
  it('accepts the install subcommand', () => {
    expect(parseArgs(['install'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: false,
        help: false,
        tag: undefined,
        local: false,
        localPath: undefined,
      },
    });
  });

  it('accepts -y and --yes', () => {
    expect(parseArgs(['install', '-y'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: true,
        help: false,
        tag: undefined,
        local: false,
        localPath: undefined,
      },
    });
    expect(parseArgs(['install', '--yes'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: true,
        help: false,
        tag: undefined,
        local: false,
        localPath: undefined,
      },
    });
  });

  it('accepts --help with or without a subcommand', () => {
    expect(parseArgs(['--help'])).toEqual({
      ok: true,
      args: {
        subcommand: undefined,
        yes: false,
        help: true,
        tag: undefined,
        local: false,
        localPath: undefined,
      },
    });
    expect(parseArgs(['install', '--help'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: false,
        help: true,
        tag: undefined,
        local: false,
        localPath: undefined,
      },
    });
  });

  it('rejects an unknown flag', () => {
    expect(parseArgs(['install', '--bogus'])).toEqual({
      ok: false,
      reason: 'unknown-flag',
      flag: '--bogus',
    });
  });

  it('rejects a missing subcommand when --help is absent', () => {
    expect(parseArgs([])).toEqual({
      ok: false,
      reason: 'missing-subcommand',
    });
  });

  it('rejects an unknown subcommand', () => {
    expect(parseArgs(['fake'])).toEqual({
      ok: false,
      reason: 'unknown-subcommand',
      subcommand: 'fake',
    });
  });

  it('accepts --tag with a value', () => {
    expect(parseArgs(['install', '--tag', 'canary'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: false,
        help: false,
        tag: 'canary',
        local: false,
        localPath: undefined,
      },
    });
  });

  it('accepts --tag with a SemVer version value', () => {
    expect(parseArgs(['install', '--tag', '1.2.0'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: false,
        help: false,
        tag: '1.2.0',
        local: false,
        localPath: undefined,
      },
    });
  });

  it('rejects --tag without a value', () => {
    expect(parseArgs(['install', '--tag'])).toEqual({
      ok: false,
      reason: 'missing-flag-value',
      flag: '--tag',
    });
    expect(parseArgs(['install', '--tag', '--yes'])).toEqual({
      ok: false,
      reason: 'missing-flag-value',
      flag: '--tag',
    });
  });

  it('accepts --local without a path', () => {
    expect(parseArgs(['install', '--local'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: false,
        help: false,
        tag: undefined,
        local: true,
        localPath: undefined,
      },
    });
  });

  it('accepts --local with a path', () => {
    expect(parseArgs(['install', '--local', '../plugin-src'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: false,
        help: false,
        tag: undefined,
        local: true,
        localPath: '../plugin-src',
      },
    });
  });

  it('does not consume the subcommand as a --local path', () => {
    expect(parseArgs(['--local', 'install'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: false,
        help: false,
        tag: undefined,
        local: true,
        localPath: undefined,
      },
    });
  });

  it('rejects --tag combined with --local', () => {
    expect(parseArgs(['install', '--tag', 'canary', '--local'])).toEqual({
      ok: false,
      reason: 'conflicting-flags',
    });
    expect(parseArgs(['install', '--local', '--tag', 'canary'])).toEqual({
      ok: false,
      reason: 'conflicting-flags',
    });
  });

  it('combines flags with --yes', () => {
    expect(parseArgs(['install', '--yes', '--local'])).toEqual({
      ok: true,
      args: {
        subcommand: 'install',
        yes: true,
        help: false,
        tag: undefined,
        local: true,
        localPath: undefined,
      },
    });
  });
});
