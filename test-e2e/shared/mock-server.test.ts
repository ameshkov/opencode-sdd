import { describe, expect, it } from 'vitest';
import { MOCK_MODEL_ID } from './mock-server-chunks.js';
import { createMockLlm } from './mock-server.js';
import { writeFileScenario, writeFilesScenario } from './scenarios.js';

/**
 * Send a streaming completion request to the mock and collect the raw SSE
 * response body.
 */
async function completions(url: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MOCK_MODEL_ID, stream: true, ...body }),
  });
  expect(res.status).toBe(200);
  return await res.text();
}

/** Parse an SSE body into a list of decoded `data:` JSON payloads. */
function parseSse(raw: string): unknown[] {
  const payloads: unknown[] = [];
  for (const block of raw.split('\n\n')) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data: ')) {
        continue;
      }
      const data = line.slice('data: '.length);
      if (data === '[DONE]') {
        continue;
      }
      payloads.push(JSON.parse(data));
    }
  }
  return payloads;
}

describe('mock LLM server', () => {
  it('streams a scripted tool call', async () => {
    const scenario = writeFileScenario('/tmp/out.md', '# Hello');
    const mock = await createMockLlm(scenario);

    try {
      const raw = await completions(mock.url, { messages: [] });
      const payloads = parseSse(raw) as Array<{
        choices: Array<{
          delta: { content?: string; tool_calls?: Array<Record<string, unknown>> };
          finish_reason: string | null;
        }>;
      }>;

      // Collect accumulated tool calls and the final finish_reason.
      const toolNames: string[] = [];
      let argBuffer = '';
      let finishReason: string | null = null;
      for (const chunk of payloads) {
        const choice = chunk.choices[0];
        for (const call of choice.delta.tool_calls ?? []) {
          if (call.function !== undefined) {
            const fn = call.function as { name?: string; arguments?: string };
            if (fn.name !== undefined) {
              toolNames.push(fn.name);
            }
            if (fn.arguments !== undefined) {
              argBuffer += fn.arguments;
            }
          }
        }
        if (choice.finish_reason !== null) {
          finishReason = choice.finish_reason;
        }
      }

      expect(toolNames).toEqual(['write']);
      expect(JSON.parse(argBuffer)).toEqual({ filePath: '/tmp/out.md', content: '# Hello' });
      expect(finishReason).toBe('tool_calls');
    } finally {
      mock.close();
    }
  });

  it('streams a final text turn after the tool call', async () => {
    const mock = await createMockLlm(writeFileScenario('/tmp/a.md', 'a'));

    try {
      await completions(mock.url, { messages: [] }); // consume tool-call turn
      const raw = await completions(mock.url, { messages: [] }); // text turn
      const payloads = parseSse(raw) as Array<{
        choices: Array<{
          delta: { content?: string };
          finish_reason: string | null;
        }>;
      }>;

      const text = payloads.map((p) => p.choices[0].delta.content ?? '').join('');
      const finishReason = payloads.find((p) => p.choices[0].finish_reason !== null)?.choices[0]
        .finish_reason;

      expect(text).toBe('Done');
      expect(finishReason).toBe('stop');
    } finally {
      mock.close();
    }
  });

  it('consumes one scenario turn per request, in order', async () => {
    const mock = await createMockLlm(
      writeFilesScenario([
        { filePath: '/tmp/a.md', content: 'A' },
        { filePath: '/tmp/b.md', content: 'B' },
      ]),
    );

    try {
      // Two tool-call turns, then one text turn.
      await completions(mock.url, { messages: [] });
      await completions(mock.url, { messages: [] });
      const raw = await completions(mock.url, { messages: [] });
      const payloads = parseSse(raw) as Array<{
        choices: Array<{ delta: { content?: string } }>;
      }>;

      expect(mock.requests).toHaveLength(3);
      expect(mock.requests[0].body).toMatchObject({ model: MOCK_MODEL_ID });
      expect(payloads.map((p) => p.choices[0].delta.content ?? '').join('')).toBe('Done');
    } finally {
      mock.close();
    }
  });

  it('terminates the SSE stream with [DONE]', async () => {
    const mock = await createMockLlm([{ type: 'text', text: 'hi' }]);

    try {
      const raw = await completions(mock.url, { messages: [] });
      expect(raw.trim().endsWith('[DONE]')).toBe(true);
    } finally {
      mock.close();
    }
  });

  it('answers opencode title-generation requests without consuming a turn', async () => {
    // opencode sends a background title-generation request (system prompt
    // "You are a title generator...") that races the agent loop. It must be
    // answered with a canned title and must NOT shift the scenario queue.
    const mock = await createMockLlm(writeFileScenario('/tmp/a.md', 'a'));

    try {
      const titleRaw = await completions(mock.url, {
        messages: [{ role: 'system', content: 'You are a title generator.' }],
      });
      const titlePayloads = parseSse(titleRaw) as Array<{
        choices: Array<{ delta: { content?: string } }>;
      }>;
      expect(titlePayloads.map((p) => p.choices[0].delta.content ?? '').join('')).toBe(
        'Mock Title',
      );

      // The scenario's first turn (the write tool call) is still intact.
      const agentRaw = await completions(mock.url, { messages: [] });
      const agentPayloads = parseSse(agentRaw) as Array<{
        choices: Array<{
          delta: { tool_calls?: Array<Record<string, unknown>> };
          finish_reason: string | null;
        }>;
      }>;
      const toolNames: string[] = [];
      let finishReason: string | null = null;
      for (const chunk of agentPayloads) {
        const choice = chunk.choices[0];
        for (const call of choice.delta.tool_calls ?? []) {
          const fn = call.function as { name?: string } | undefined;
          if (fn?.name !== undefined) {
            toolNames.push(fn.name);
          }
        }
        if (choice.finish_reason !== null) {
          finishReason = choice.finish_reason;
        }
      }
      expect(toolNames).toEqual(['write']);
      expect(finishReason).toBe('tool_calls');
      expect(mock.requests).toHaveLength(2);
    } finally {
      mock.close();
    }
  });

  it('reset() replaces the scenario queue and clears captured requests', async () => {
    const mock = await createMockLlm(writeFileScenario('/tmp/a.md', 'a'));

    try {
      // Consume both scripted turns (tool call, then text).
      await completions(mock.url, { messages: [] });
      await completions(mock.url, { messages: [] });
      expect(mock.requests).toHaveLength(2);

      // Reload a fresh scenario; captured history is wiped.
      mock.reset([{ type: 'text', text: 'fresh' }]);
      expect(mock.requests).toHaveLength(0);

      // The new scenario's first (and only) turn is served next.
      const raw = await completions(mock.url, { messages: [] });
      const payloads = parseSse(raw) as Array<{
        choices: Array<{ delta: { content?: string } }>;
      }>;
      expect(payloads.map((p) => p.choices[0].delta.content ?? '').join('')).toBe('fresh');
      expect(mock.requests).toHaveLength(1);
    } finally {
      mock.close();
    }
  });
});
