import { describe, expect, it } from 'vitest';
import { parseArgs } from './argv.js';

describe('parseArgs', () => {
  it('accepts the install subcommand', () => {
    expect(parseArgs(['install'])).toEqual({
      ok: true,
      args: { subcommand: 'install', yes: false, help: false },
    });
  });

  it('accepts -y and --yes', () => {
    expect(parseArgs(['install', '-y'])).toEqual({
      ok: true,
      args: { subcommand: 'install', yes: true, help: false },
    });
    expect(parseArgs(['install', '--yes'])).toEqual({
      ok: true,
      args: { subcommand: 'install', yes: true, help: false },
    });
  });

  it('accepts --help with or without a subcommand', () => {
    expect(parseArgs(['--help'])).toEqual({
      ok: true,
      args: { subcommand: undefined, yes: false, help: true },
    });
    expect(parseArgs(['install', '--help'])).toEqual({
      ok: true,
      args: { subcommand: 'install', yes: false, help: true },
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
});
