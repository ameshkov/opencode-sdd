import { describe, expect, it, vi } from 'vitest';
import { createV1Logger } from './logger.js';
import { stubClient } from '../../../test/stub-client.js';

describe('createV1Logger', () => {
  it('forwards each level to client.app.log with the service name', async () => {
    const client = stubClient();
    const logger = createV1Logger(client);

    await logger.debug('debug message');
    await logger.info('info message');
    await logger.warn('warn message');
    await logger.error('error message');

    expect(vi.mocked(client.app.log).mock.calls).toEqual([
      [{ body: { service: 'opencode-sdd', level: 'debug', message: 'debug message' } }],
      [{ body: { service: 'opencode-sdd', level: 'info', message: 'info message' } }],
      [{ body: { service: 'opencode-sdd', level: 'warn', message: 'warn message' } }],
      [{ body: { service: 'opencode-sdd', level: 'error', message: 'error message' } }],
    ]);
  });

  it('omits the extra field when no structured fields are given', async () => {
    const client = stubClient();
    await createV1Logger(client).info('no extra');

    const body = vi.mocked(client.app.log).mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('extra');
  });

  it('attaches structured fields when given', async () => {
    const client = stubClient();
    await createV1Logger(client).warn('with extra', { count: 3 });

    expect(vi.mocked(client.app.log)).toHaveBeenCalledWith({
      body: {
        service: 'opencode-sdd',
        level: 'warn',
        message: 'with extra',
        extra: { count: 3 },
      },
    });
  });

  it('swallows logging failures', async () => {
    const client = stubClient();
    vi.mocked(client.app.log).mockRejectedValueOnce(new Error('network down'));

    await expect(createV1Logger(client).error('still fine')).resolves.toBeUndefined();
  });
});
