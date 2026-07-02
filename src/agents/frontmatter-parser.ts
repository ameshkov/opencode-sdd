import type { AgentConfig } from '@opencode-ai/sdk';
import { parseYamlMap, splitFrontmatter } from '../utils/index.js';

/** A successfully parsed agent: its name and opencode-shaped config. */
interface ParsedAgent {
  readonly name: string;
  readonly config: AgentConfig;
}

/** Controlled parse failure for a single agent file. */
interface AgentParseFailure {
  readonly ok: false;
  readonly name: string;
  readonly reason: string;
}

/** Successful parse result. */
interface AgentParseSuccess {
  readonly ok: true;
  readonly agent: ParsedAgent;
}

/**
 * Discriminated result of parsing one agent Markdown file. The parser never
 * throws; malformed input is reported as an {@link AgentParseFailure}.
 */
export type AgentParseResult = AgentParseSuccess | AgentParseFailure;

const VALID_MODES = new Set<string>(['subagent', 'primary', 'all']);

/**
 * Build an {@link AgentConfig} from parsed frontmatter fields.
 *
 * Requires a non-empty `description` and a valid `mode`. Optionally carries
 * `hidden`, `tools`, and `permission` through. Returns `null` when required
 * fields are missing or invalid.
 */
function assembleAgentConfig(fields: Record<string, unknown>): AgentConfig | null {
  const description = fields['description'];
  if (typeof description !== 'string' || description.trim() === '') {
    return null;
  }
  const mode = fields['mode'];
  if (typeof mode !== 'string' || !VALID_MODES.has(mode)) {
    return null;
  }
  const config: AgentConfig = { description, mode: mode as AgentConfig['mode'] };
  if (typeof fields['hidden'] === 'boolean') {
    config['hidden'] = fields['hidden'];
  }
  const tools = fields['tools'];
  if (tools !== null && typeof tools === 'object') {
    config.tools = tools as AgentConfig['tools'];
  }
  const permission = fields['permission'];
  if (permission !== null && typeof permission === 'object') {
    config.permission = permission as AgentConfig['permission'];
  }
  return config;
}

/**
 * Parse one agent Markdown file into a {@link ParsedAgent}.
 *
 * @param name - The agent name (file name without `.md`).
 * @param raw - The raw file content.
 * @returns An {@link AgentParseResult}; never throws.
 */
export function parseAgentFile(name: string, raw: string): AgentParseResult {
  const split = splitFrontmatter(raw);
  if (split === null) {
    return { ok: false, name, reason: 'unclosed frontmatter fence' };
  }
  const [frontmatter, body] = split;
  if (frontmatter === null || frontmatter.trim() === '') {
    return { ok: false, name, reason: 'missing or empty description (no frontmatter)' };
  }
  const fields = parseYamlMap(frontmatter);
  const config = assembleAgentConfig(fields);
  if (config === null) {
    const hasDescription = typeof fields['description'] === 'string';
    return {
      ok: false,
      name,
      reason: hasDescription ? 'missing or invalid mode' : 'missing or empty description',
    };
  }
  const prompt = body.replace(/^\n+/, '').replace(/\s+$/, '\n');
  if (prompt.trim() !== '') {
    config.prompt = prompt;
  }
  return { ok: true, agent: { name, config } };
}
