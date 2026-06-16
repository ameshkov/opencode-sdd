import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger.js';
import { stubClient } from '../../test/stub-client.js';

describe('createLogger', () => {
  it('submits an info entry through client.app.log', async () => {
    const client = stubClient();

    await createLogger(client).info('hello');

    expect(vi.mocked(client.app.log)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.app.log)).toHaveBeenCalledWith({
      body: {
        service: 'opencode-sdd',
        level: 'info',
        message: 'hello',
      },
    });
  });

  it('forwards structured extra metadata', async () => {
    const client = stubClient();

    await createLogger(client).warn('careful', { task: 'prd' });

    expect(vi.mocked(client.app.log)).toHaveBeenCalledWith({
      body: {
        service: 'opencode-sdd',
        level: 'warn',
        message: 'careful',
        extra: { task: 'prd' },
      },
    });
  });

  it('omits the extra field when none is provided', async () => {
    const client = stubClient();

    await createLogger(client).error('broken');

    const body = vi.mocked(client.app.log).mock.calls[0]?.[0]?.body;
    expect(body).not.toHaveProperty('extra');
  });

  it('supports all log levels', async () => {
    const client = stubClient();
    const logger = createLogger(client);

    await logger.debug('d');
    await logger.info('i');
    await logger.warn('w');
    await logger.error('e');

    const levels = vi.mocked(client.app.log).mock.calls.map((call) => call[0]?.body?.level);
    expect(levels).toEqual(['debug', 'info', 'warn', 'error']);
  });

  it('swallows submission errors so logging never throws', async () => {
    const client = stubClient();
    vi.mocked(client.app.log).mockRejectedValueOnce(new Error('network down'));

    await expect(createLogger(client).info('noop')).resolves.toBeUndefined();
  });
});
