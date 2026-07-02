/**
 * Generic Markdown frontmatter helpers shared by the command and agent
 * definition layers. Neither layer imports from the other; both import
 * these helpers from the shared `utils` layer below them.
 */

const FRONTMATTER_DELIMITER = '---';

/**
 * Split raw file content into the frontmatter text and the prompt body.
 *
 * @returns A tuple `[frontmatter, body]` (`frontmatter` is `null` when no
 *   leading fence is present), or `null` for the whole result when the
 *   fence is unclosed. Never throws.
 */
export function splitFrontmatter(raw: string): [string | null, string] | null {
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
 * Parse a simple YAML scalar. Converts `true`/`false` to booleans and
 * strips one matching pair of quotes. Never throws.
 *
 * @internal Exported for tests only; not part of the public module API.
 *   Production callers consume {@link parseYamlMap} / {@link splitFrontmatter}
 *   instead.
 */
export function parseScalar(raw: string): string | boolean {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
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
 * @returns `[joined content, next index]` where each continuation line has
 *   its leading 2-space indent removed.
 */
function collectBlockLines(lines: string[], startIndex: number): [string, number] {
  const contentLines: string[] = [];
  let i = startIndex;
  while (i < lines.length && /^\s{2,}/.test(lines[i] ?? '')) {
    contentLines.push((lines[i] as string).replace(/^\s\s/, ''));
    i++;
  }
  return [contentLines.join('\n'), i];
}

/** Compute the leading-space indent of a line (0 if empty). */
function lineIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/**
 * Match a YAML mapping key, either bare (`edit`), double-quoted (`"*"`), or
 * single-quoted (`'*'`). Returns the unquoted key, or `null` if the line is
 * not a `key: value` mapping at all.
 */
function matchMapKey(text: string): string | null {
  const m = text.match(/^(?:"([^"]+)"|'([^']+)'|([a-zA-Z_][a-zA-Z0-9_-]*)):\s*(.*)$/);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/**
 * Collect a one-level indented map whose children share `childIndent`.
 *
 * Recurses into deeper-indented sub-maps when a key has an empty scalar
 * value (e.g. `task:` under `permission:`). Scalars are parsed by
 * {@link parseScalar}; quoted keys are supported via {@link matchMapKey}.
 *
 * @returns `[map, next index]` pointing at the first line indented less
 *   than `childIndent` (or end of input).
 */
function collectNestedMap(
  lines: string[],
  startIndex: number,
  childIndent: number,
): [Map<string, unknown>, number] {
  const map = new Map<string, unknown>();
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const indent = lineIndent(line);
    if (indent < childIndent) break;
    if (indent > childIndent) {
      // Deeper line belongs to a sibling we failed to open; skip defensively.
      i++;
      continue;
    }
    const sub = line.slice(childIndent);
    const key = matchMapKey(sub);
    if (key === null) {
      i++;
      continue;
    }
    const rest = sub.slice(sub.indexOf(':') + 1).trim();
    if (rest === '') {
      const nextIndent = i + 1 < lines.length ? lineIndent(lines[i + 1] ?? '') : -1;
      if (nextIndent > childIndent) {
        const [child, nextI] = collectNestedMap(lines, i + 1, nextIndent);
        map.set(key, Object.fromEntries(child));
        i = nextI;
      } else {
        map.set(key, null);
        i++;
      }
    } else {
      map.set(key, parseScalar(rest));
      i++;
    }
  }
  return [map, i];
}

/**
 * Parse the known frontmatter keys into a generic record.
 *
 * Supports top-level scalars, YAML `|` / `>` block scalars (with optional
 * `-` / `+` chomping), and one-level nested maps (for `tools:` / `permission:`).
 * Unknown keys are ignored. Never throws.
 */
export function parseYamlMap(frontmatter: string): Record<string, unknown> {
  const lines = frontmatter.split('\n');
  const result: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }
    const key = kvMatch[1] as string;
    const value = kvMatch[2];
    const blockMatch = value?.match(/^[|>][-+]?\s*$/);
    if (blockMatch) {
      const [joined, nextI] = collectBlockLines(lines, i + 1);
      i = nextI;
      const chomp = (value ?? '').trimEnd();
      result[key] = chomp.endsWith('-') ? joined : joined + '\n';
      continue;
    }
    if (value !== undefined && value.trim() !== '') {
      result[key] = parseScalar(value);
      i++;
      continue;
    }
    const firstChildIndent = i + 1 < lines.length ? lineIndent(lines[i + 1] ?? '') : -1;
    if (firstChildIndent > lineIndent(line)) {
      const [nested, nextI] = collectNestedMap(lines, i + 1, firstChildIndent);
      i = nextI;
      if (nested.size > 0) {
        result[key] = Object.fromEntries(nested);
      } else {
        result[key] = null;
      }
    } else {
      result[key] = null;
      i++;
    }
  }
  return result;
}
