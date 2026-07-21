import { describe, expect, it } from 'vitest';
import { USAGE_TEXT } from './usage.js';

describe('USAGE_TEXT', () => {
  it('lists the flags and the install workflow', () => {
    expect(USAGE_TEXT).toContain('-y');
    expect(USAGE_TEXT).toContain('--yes');
    expect(USAGE_TEXT).toContain('--help');
    expect(USAGE_TEXT).toContain('install');
  });
});
