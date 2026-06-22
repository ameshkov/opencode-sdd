/**
 * opencode command configuration shape.
 *
 * Matches the inline command type from `Config['command']` in
 * `@opencode-ai/sdk`.
 */
export interface CommandConfig {
  readonly template: string;
  readonly description?: string;
  readonly agent?: string;
  readonly model?: string;
  readonly subtask?: boolean;
}

/**
 * A command parsed from a Markdown file: its name and opencode-shaped config.
 */
interface ParsedCommand {
  readonly name: string;
  readonly config: CommandConfig;
}

/**
 * Controlled parse failure for a single command file.
 */
interface ParseFailure {
  readonly ok: false;
  readonly name: string;
  readonly reason: string;
}

/**
 * Successful parse result.
 */
interface ParseSuccess {
  readonly ok: true;
  readonly command: ParsedCommand;
}

/**
 * Discriminated result of parsing one command Markdown file. The parser never
 * throws; malformed input is reported as a {@link ParseFailure}.
 */
export type ParseResult = ParseSuccess | ParseFailure;

const FRONTMATTER_DELIMITER = '---';

/**
 * Split raw file content into the frontmatter text and the prompt body.
 *
 * Returns `null` for the frontmatter part when no valid leading fence is
 * present. Never throws.
 *
 * @param raw - The raw file content.
 * @returns A tuple of `[frontmatter, body]` where `frontmatter` is `null`
 *   when absent, or `null` for the whole result when the fence is unclosed.
 */
function splitFrontmatter(raw: string): [string | null, string] | null {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return [null, raw];
  }
  const closeIndex = lines.indexOf(FRONTMATTER_DELIMITER, 1);
  if (closeIndex === -1) {
    return null;
  }
  const frontmatter = lines.slice(1, closeIndex).join('\n');
  const body = lines.slice(closeIndex + 1).join('\n');
  return [frontmatter, body];
}

/**
 * Parse a simple YAML scalar value string.
 *
 * Handles bare scalars, quoted scalars (single/double), and converts
 * `true` / `false` to booleans. Never throws.
 */
function parseScalar(raw: string): string | boolean {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // Strip matching quotes.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Collect indented continuation lines for a YAML block scalar.
 *
 * @param lines - All frontmatter lines.
 * @param startIndex - Index of the first indented line after the `|` / `>`
 *   indicator.
 * @returns A tuple of `[joined content, new index]` where the joined content
 *   is the concatenated indented lines with 2-space indent stripped, and
 *   `new index` points to the first non-indented line after the block (or
 *   `lines.length` if the block runs to the end).
 */
function collectBlockLines(lines: string[], startIndex: number): [string, number] {
  const contentLines: string[] = [];
  let i = startIndex;
  while (i < lines.length && /^\s{2,}/.test(lines[i])) {
    contentLines.push(lines[i].replace(/^\s\s/, ''));
    i++;
  }
  return [contentLines.join('\n'), i];
}

/**
 * Parse the known scalar frontmatter keys into a partial command config.
 *
 * Supports `description` (including YAML `|` / `>` block scalars with
 * optional chomping indicators `-` / `+` and indented continuations),
 * `agent`, `model`, and `subtask`. Unknown keys are ignored. Never throws.
 *
 * @param frontmatter - The raw frontmatter text (without fences).
 * @returns The parsed fields, or `null` when `description` is missing or
 *   empty after trimming.
 */
function parseFrontmatterFields(frontmatter: string): Partial<CommandConfig> | null {
  const lines = frontmatter.split('\n');
  const result: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;

    // Match key: value (simple scalar).
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const value = kvMatch[2];

    // Block scalar indicators: |, |-, |+, >, >-, >+.
    const blockMatch = value?.match(/^[|>][-+]?\s*$/);
    if (blockMatch) {
      const [joined, nextI] = collectBlockLines(lines, i + 1);
      i = nextI;
      const chomp = value.trimEnd();
      if (chomp.endsWith('-')) {
        result[key] = joined;
      } else if (chomp.endsWith('+')) {
        result[key] = joined + '\n';
      } else {
        result[key] = joined + '\n';
      }
      continue;
    }

    // Simple scalar.
    result[key] = parseScalar(value);
    i++;
  }

  return assembleConfig(result);
}

/**
 * Build a partial {@link CommandConfig} from parsed frontmatter fields.
 *
 * @returns The config when `description` is a non-empty string, or `null`.
 */
function assembleConfig(fields: Record<string, unknown>): Partial<CommandConfig> | null {
  const description = fields['description'];
  if (typeof description !== 'string' || description.trim() === '') {
    return null;
  }

  const config: Record<string, unknown> = {
    description: description,
  };

  if (typeof fields['agent'] === 'string' && fields['agent'].trim() !== '') {
    config['agent'] = fields['agent'];
  }

  if (typeof fields['model'] === 'string' && fields['model'].trim() !== '') {
    config['model'] = fields['model'];
  }

  if ('subtask' in fields) {
    if (typeof fields['subtask'] === 'boolean') {
      config['subtask'] = fields['subtask'];
    }
  }

  return config as Partial<CommandConfig>;
}

/**
 * Parse one command Markdown file into a {@link ParsedCommand}.
 *
 * @param name - The command name (file name without `.md`).
 * @param raw - The raw file content.
 * @returns A {@link ParseResult}; never throws.
 */
export function parseCommandFile(name: string, raw: string): ParseResult {
  const split = splitFrontmatter(raw);
  if (split === null) {
    return { ok: false, name, reason: 'unclosed frontmatter fence' };
  }
  const [frontmatter, body] = split;
  const fields =
    frontmatter === null || frontmatter.trim() === '' ? null : parseFrontmatterFields(frontmatter);
  if (fields === null) {
    return { ok: false, name, reason: 'missing or empty description' };
  }
  const template = body.replace(/^\n+/, '').replace(/\s+$/, '\n');
  if (template.trim() === '') {
    return { ok: false, name, reason: 'empty body' };
  }
  return {
    ok: true,
    command: {
      name,
      config: { template, ...fields } as CommandConfig,
    },
  };
}
