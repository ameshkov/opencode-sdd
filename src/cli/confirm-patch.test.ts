import { describe, expect, it, vi } from 'vitest';
import { confirmPatch } from './confirm-patch.js';

describe('confirmPatch', () => {
  it('returns true when the user confirms', async () => {
    const confirmApply = vi.fn().mockResolvedValue(true);
    const result = await confirmPatch({ confirmApply });
    expect(result).toBe(true);
    expect(confirmApply).toHaveBeenCalledTimes(1);
    const config = confirmApply.mock.calls[0]?.[0] as {
      message: string;
      default?: boolean;
    };
    expect(config.message).toContain('Apply');
    expect(config.default).toBe(true); // Enter = confirm, the common path
  });

  it('returns false when the user declines', async () => {
    const confirmApply = vi.fn().mockResolvedValue(false);
    const result = await confirmPatch({ confirmApply });
    expect(result).toBe(false);
  });

  it('returns false when confirm rejects with ExitPromptError (Ctrl-C -> decline; exit 0)', async () => {
    const exitError = new Error('User pressed Ctrl-C');
    exitError.name = 'ExitPromptError';
    const confirmApply = vi.fn().mockRejectedValue(exitError);
    const result = await confirmPatch({ confirmApply });
    expect(result).toBe(false);
  });

  it('rethrows non-ExitPromptError failures so main can surface them as non-zero exits', async () => {
    const confirmApply = vi.fn().mockRejectedValue(new Error('broken TTY'));
    await expect(confirmPatch({ confirmApply })).rejects.toThrow('broken TTY');
  });
});
