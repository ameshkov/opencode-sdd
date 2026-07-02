import { describe, expect, it } from 'vitest';
import { ALLOWED_COMMANDS, AVAILABLE_COMMANDS, formatCommandError } from './allowlist.js';

describe('ALLOWED_COMMANDS', () => {
  it('contains exactly the five prd-* stage commands in a stable order', () => {
    expect(ALLOWED_COMMANDS).toEqual([
      'prd-issue-to-plan',
      'prd-review-plan',
      'prd-implement-issue',
      'prd-validate-issue',
      'prd-validate',
    ]);
  });
});

describe('AVAILABLE_COMMANDS', () => {
  it('is the allowlist joined by ", "', () => {
    expect(AVAILABLE_COMMANDS).toBe(
      'prd-issue-to-plan, prd-review-plan, prd-implement-issue, ' +
        'prd-validate-issue, prd-validate',
    );
  });
});

describe('formatCommandError', () => {
  it('formats an empty argument with the empty-arg reason', () => {
    expect(formatCommandError('', 'empty')).toBe(
      'Error: "" is not a loadable command. Available commands: ' + AVAILABLE_COMMANDS + '.',
    );
  });

  it('formats a non-allowlisted name with the not-allowed reason', () => {
    expect(formatCommandError('prd-write', 'not-allowed')).toBe(
      'Error: "prd-write" is not a loadable command. Available commands: ' +
        AVAILABLE_COMMANDS +
        '.',
    );
  });

  it('formats a missing source file with the missing reason', () => {
    expect(formatCommandError('prd-validate', 'missing')).toBe(
      'Error: "prd-validate" is not a loadable command. Available commands: ' +
        AVAILABLE_COMMANDS +
        '.',
    );
  });

  it('formats an unreadable source file with the unreadable reason', () => {
    expect(formatCommandError('prd-validate', 'unreadable')).toBe(
      'Error: "prd-validate" is not a loadable command. Available commands: ' +
        AVAILABLE_COMMANDS +
        '.',
    );
  });
});
