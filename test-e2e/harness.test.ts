import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { isolateServerAuth, replyToPendingQuestion, replyToQuestion } from './harness.js';

const KEYS = ['OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME'] as const;

/** Restore any auth env vars this file mutates, so tests stay isolated. */
afterEach(() => {
  for (const key of KEYS) {
    delete process.env[key];
  }
});

describe('isolateServerAuth', () => {
  it('removes inherited OPENCODE_SERVER_* auth vars and restores them', () => {
    process.env.OPENCODE_SERVER_PASSWORD = 'secret-from-parent-session';
    process.env.OPENCODE_SERVER_USERNAME = 'parent-user';

    const isolated = isolateServerAuth();

    expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
    expect(process.env.OPENCODE_SERVER_USERNAME).toBeUndefined();

    isolated.restore();

    expect(process.env.OPENCODE_SERVER_PASSWORD).toBe('secret-from-parent-session');
    expect(process.env.OPENCODE_SERVER_USERNAME).toBe('parent-user');
  });

  it('is a no-op restore when the vars were never set', () => {
    for (const key of KEYS) {
      delete process.env[key];
    }

    const isolated = isolateServerAuth();
    expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
    expect(process.env.OPENCODE_SERVER_USERNAME).toBeUndefined();

    expect(() => isolated.restore()).not.toThrow();
    expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
  });
});

/**
 * A tiny stand-in for opencode's `/question` HTTP API so the reply helpers
 * can be unit-tested with real `fetch` round trips (not mocks). Exposes a
 * single pending-question slot and records every reply posted to it.
 */
interface FakeQuestionServer {
  url: string;
  setPending(id: string | null): void;
  replies: Array<{ id: string; answers: string[][] }>;
  close(): Promise<void>;
}

/** Start a fake `/question` server on an ephemeral port. */
function startFakeQuestionServer(): Promise<FakeQuestionServer> {
  return new Promise((resolve, reject) => {
    let pendingId: string | null = null;
    const replies: Array<{ id: string; answers: string[][] }> = [];
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/question') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(pendingId === null ? [] : [{ id: pendingId }]));
        return;
      }
      if (req.method === 'POST' && url.pathname.startsWith('/question/')) {
        const id = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          const parsed = JSON.parse(body) as { answers: string[][] };
          replies.push({ id, answers: parsed.answers });
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{}');
        });
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('failed to bind fake question server'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        setPending: (id) => {
          pendingId = id;
        },
        replies,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
}

describe('question reply helpers', () => {
  let server: FakeQuestionServer;

  afterEach(async () => {
    await server?.close();
  });

  it('replyToQuestion posts the answer to /question/:id/reply', async () => {
    server = await startFakeQuestionServer();
    server.setPending('q1');

    await replyToQuestion(server.url, 'proj', 'q1', [['Approach A']]);

    expect(server.replies).toEqual([{ id: 'q1', answers: [['Approach A']] }]);
  });

  it('replyToPendingQuestion waits for a question to appear then replies', async () => {
    server = await startFakeQuestionServer();
    server.setPending(null);

    // A question appears shortly after the helper starts polling, proving it
    // actually polls rather than reading only the (empty) initial state.
    setTimeout(() => server.setPending('q1'), 60);

    await replyToPendingQuestion(server.url, 'proj', [['Approach B']], 2_000);

    expect(server.replies).toEqual([{ id: 'q1', answers: [['Approach B']] }]);
  });

  it('replyToPendingQuestion throws when no question appears in time', async () => {
    server = await startFakeQuestionServer();
    server.setPending(null);

    await expect(replyToPendingQuestion(server.url, 'proj', [['X']], 80)).rejects.toThrow(
      'No pending question appeared within the timeout',
    );
  });
});
