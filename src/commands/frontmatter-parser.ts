import { parseYamlMap, splitFrontmatter } from '../utils/index.js';

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

/**
 * Parse the known scalar frontmatter keys into a partial command config.
 *
 * Delegates the generic YAML parsing to the shared
 * {@link parseYamlMap} helper and then assembles the command-shaped result.
 * Never throws.
 *
 * @param frontmatter - The raw frontmatter text (without fences).
 * @returns The parsed fields, or `null` when `description` is missing or
 *   empty after trimming.
 */
function parseFrontmatterFields(frontmatter: string): Partial<CommandConfig> | null {
  const result = parseYamlMap(frontmatter);
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
