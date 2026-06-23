/**
 * Scripted scenarios for the mock LLM, expressed as ordered {@link Turn}s.
 *
 * Each turn is consumed by one `/v1/chat/completions` request, so a scenario
 * is a faithful script of the agent loop: a tool-call turn triggers the `write`
 * tool, opencode feeds the tool result back, and the next turn runs.
 */
import type { Turn } from './mock-server.js';

/**
 * Scenario: write a single file, then reply "Done".
 *
 * @param filePath - Absolute path the model should write to.
 * @param content - Exact file content the model should write.
 * @returns A two-turn scenario: `[write(filePath, content), text("Done")]`.
 */
export function writeFileScenario(filePath: string, content: string): Turn[] {
  return [
    {
      type: 'tool-call',
      toolCalls: [{ name: 'write', arguments: { filePath, content } }],
    },
    { type: 'text', text: 'Done' },
  ];
}

/**
 * Scenario: write several files in sequence, then reply "Done".
 *
 * One tool-call turn per file — each is a separate round-trip through the
 * agent loop — followed by a final text turn that terminates the run.
 *
 * @param files - Files to write, in order.
 * @returns One tool-call turn per file plus a terminating text turn.
 */
export function writeFilesScenario(files: Array<{ filePath: string; content: string }>): Turn[] {
  const turns: Turn[] = files.map((file) => ({
    type: 'tool-call',
    toolCalls: [{ name: 'write', arguments: { filePath: file.filePath, content: file.content } }],
  }));
  turns.push({ type: 'text', text: 'Done' });
  return turns;
}
