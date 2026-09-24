import { afterEach, describe, expect, it, vi } from 'vitest';
import { createV2Logger } from './logger.js';

describe('createV2Logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes every level to stderr with the level in the line', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createV2Logger();

    await logger.debug('debug message');
    await logger.info('info message');
    await logger.warn('warn message');
    await logger.error('error message');

    expect(error.mock.calls).toEqual([
      ['opencode-sdd: debug: debug message'],
      ['opencode-sdd: info: info message'],
      ['opencode-sdd: warn: warn message'],
      ['opencode-sdd: error: error message'],
    ]);
  });

  it('does not write to stdout (the V2 stdio channel)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await createV2Logger().info('only stderr');

    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it('appends structured fields as JSON', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await createV2Logger().info('registered', { count: 6 });

    expect(error).toHaveBeenCalledWith('opencode-sdd: info: registered {"count":6}');
  });

  it('renders a placeholder for unserializable fields', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    await createV2Logger().info('odd', circular);

    expect(error).toHaveBeenCalledWith('opencode-sdd: info: odd [unserializable extra]');
  });
});
