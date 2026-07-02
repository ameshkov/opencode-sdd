import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentConfig } from '@opencode-ai/sdk';
import type { Logger } from '../utils/index.js';
import { parseAgentFile } from './frontmatter-parser.js';

/**
 * Load every `*.md` agent file from a directory into a name-to-config map.
 *
 * Files are parsed with the agent frontmatter parser. Any file that fails
 * to parse is skipped and logged via `logger`. Unrecoverable directory
 * errors (missing or unreadable directory) yield an empty map and a logged
 * warning. The loader never throws.
 *
 * @param directory - Absolute path to the agents directory.
 * @param logger - Plugin logger used to report skipped files and directory
 *   errors.
 * @returns A `Map<string, AgentConfig>` keyed by agent name, in
 *   deterministic (lexicographic) file-name order.
 */
export async function loadAgents(
  directory: string,
  logger: Logger,
): Promise<Map<string, AgentConfig>> {
  const agents = new Map<string, AgentConfig>();
  let entries: string[];
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) {
      await logger.warn('agents path is not a directory', { directory });
      return agents;
    }
    entries = (await readdir(directory)).sort();
  } catch (error) {
    await logger.warn('agents directory unreadable', {
      directory,
      error: error instanceof Error ? error.message : String(error),
    });
    return agents;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.md')) {
      continue;
    }
    const name = entry.slice(0, -3);
    const filePath = join(directory, entry);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      await logger.error('failed to read agent file', {
        file: entry,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const result = parseAgentFile(name, raw);
    if (!result.ok) {
      await logger.error('skipping malformed agent file', {
        file: entry,
        reason: result.reason,
      });
      continue;
    }
    agents.set(result.agent.name, result.agent.config);
  }
  return agents;
}
