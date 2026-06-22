import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandConfig } from './frontmatter-parser.js';
import type { Logger } from '../utils/index.js';
import { parseCommandFile } from './frontmatter-parser.js';

/**
 * Load every `*.md` command file from a directory into a name-to-config map.
 *
 * Files are parsed with the frontmatter parser. Any file that fails to parse
 * is skipped and logged via `logger`. Unrecoverable directory errors (missing
 * or unreadable directory) yield an empty map and a logged warning. The
 * loader never throws.
 *
 * @param directory - Absolute path to the commands directory.
 * @param logger - Plugin logger used to report skipped files and directory
 *   errors.
 * @returns A `Map<string, CommandConfig>` keyed by command name, in
 *   deterministic (lexicographic) file-name order.
 */
export async function loadCommands(
  directory: string,
  logger: Logger,
): Promise<Map<string, CommandConfig>> {
  const commands = new Map<string, CommandConfig>();
  let entries: string[];
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) {
      await logger.warn('commands path is not a directory', { directory });
      return commands;
    }
    entries = (await readdir(directory)).sort();
  } catch (error) {
    await logger.warn('commands directory unreadable', {
      directory,
      error: error instanceof Error ? error.message : String(error),
    });
    return commands;
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
      await logger.error('failed to read command file', {
        file: entry,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const result = parseCommandFile(name, raw);
    if (!result.ok) {
      await logger.error('skipping malformed command file', {
        file: entry,
        reason: result.reason,
      });
      continue;
    }
    commands.set(result.command.name, result.command.config);
  }
  return commands;
}
