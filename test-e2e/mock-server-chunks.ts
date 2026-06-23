/**
 * SSE chunk builders for the mock OpenAI-compatible LLM.
 *
 * Each builder returns the complete textual SSE response (a concatenation of
 * `data: <json>\n\n` lines terminated by `data: [DONE]\n\n`) for a single
 * `/v1/chat/completions` call. Kept separate from the HTTP server so the wire
 * format is unit-testable in isolation.
 */

/** The model id the mock advertises and echoes back in every chunk. */
export const MOCK_MODEL_ID = 'mock-model';

/** The terminal SSE marker required by the OpenAI streaming protocol. */
export const SSE_DONE = 'data: [DONE]\n\n';

/** Wrap a payload object as a single SSE `data:` line. */
function dataLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Shared chat-completion-chunk fields, minus the `choices` array. */
function chunkEnvelope(requestId: string): Record<string, unknown> {
  return {
    id: requestId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: MOCK_MODEL_ID,
  };
}

/** Build the SSE stream for a text turn. */
export function textChunks(text: string, requestId: string): string[] {
  const envelope = chunkEnvelope(requestId);
  return [
    dataLine({
      ...envelope,
      choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
    }),
    dataLine({
      ...envelope,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    }),
    SSE_DONE,
  ];
}

/**
 * Build the two SSE chunks that announce a single tool call: the first opens
 * the call with its name and an empty arguments buffer; the second streams the
 * full arguments JSON. The provider accumulates argument deltas by `index`.
 */
function toolCallDeltaChunks(
  call: { name: string; arguments: Record<string, unknown> },
  index: number,
  envelope: Record<string, unknown>,
): string[] {
  return [
    dataLine({
      ...envelope,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [
              {
                index,
                id: `call_${envelope.id}_${index}`,
                type: 'function',
                function: { name: call.name, arguments: '' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    }),
    dataLine({
      ...envelope,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [{ index, function: { arguments: JSON.stringify(call.arguments) } }],
          },
          finish_reason: null,
        },
      ],
    }),
  ];
}

/** Build the SSE stream for a tool-call turn (one or more tool calls). */
export function toolCallChunks(
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
  requestId: string,
): string[] {
  const envelope = chunkEnvelope(requestId);
  const chunks = toolCalls.flatMap((call, index) => toolCallDeltaChunks(call, index, envelope));
  chunks.push(
    dataLine({
      ...envelope,
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    }),
  );
  chunks.push(SSE_DONE);
  return chunks;
}
