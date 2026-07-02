import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { splitFrontmatter } from '../utils/index.js';

/** Successful load: the command body (frontmatter stripped) and source path. */
interface CommandSourceOk {
  readonly ok: true;
  readonly body: string;
  readonly absPath: string;
}

/** Failed load. `reason` matches the {@link CommandLoadReason} codes. */
interface CommandSourceErr {
  readonly ok: false;
  readonly reason: 'missing' | 'unreadable';
}

/**
 * Discriminated result of loading one command's Markdown source. Never thrown.
 */
export type CommandSourceResult = CommandSourceOk | CommandSourceErr;

/**
 * Load `<commandsDir>/<name>.md`, strip its frontmatter, and return the body.
 *
 * The body is normalized with the same leading/trailing whitespace rule the
 * command parser uses: drop leading newlines, collapse trailing whitespace to
 * a single newline. A missing file yields `{ ok: false, reason: 'missing' }`;
 * an unreadable file (I/O error, directory in place of a file) or a malformed
 * frontmatter fence (unclosed `---`) yields
 * `{ ok: false, reason: 'unreadable' }`. Never throws.
 *
 * @param name - Command name (the file stem, no `.md`).
 * @param commandsDir - Absolute path to the commands directory.
 */
export async function loadCommandSource(
  name: string,
  commandsDir: string,
): Promise<CommandSourceResult> {
  const absPath = join(commandsDir, `${name}.md`);
  let info;
  try {
    info = await stat(absPath);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (!info.isFile()) {
    return { ok: false, reason: 'unreadable' };
  }
  let raw: string;
  try {
    raw = await readFile(absPath, 'utf8');
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const split = splitFrontmatter(raw);
  if (split === null) {
    return { ok: false, reason: 'unreadable' };
  }
  const [, body] = split;
  const normalized = body.replace(/^\n+/, '').replace(/\s+$/, '\n');
  return { ok: true, body: normalized, absPath };
}
