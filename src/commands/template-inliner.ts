import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSET_REFERENCE_TOKEN } from '../utils/index.js';

/** Result of {@link inlineAssetReferences}. */
export interface InlineAssetResult {
  /** The template with every resolvable asset reference replaced by content. */
  readonly text: string;
  /** Relative asset paths that could not be read. */
  readonly missing: readonly string[];
}

/**
 * Inline every `@opencode-sdd-templates/<path>` asset reference in a command
 * template with the referenced file's content.
 *
 * opencode V1 inlines `@<abs-path>` mentions natively when a command runs, so
 * the V1 adapter only rewrites the token to an absolute path. V2 does not
 * inline mentions in session prompts (verified against 2.0.14), so the V2
 * adapter must inline the file content itself to preserve the same
 * model-visible prompt.
 *
 * Unreadable references are left as an `@<abs-path>` mention (the V1 rewritten
 * form) so the model can still read the file through its `read` tool; the
 * relative paths are returned in `missing` so the caller can log them.
 *
 * @param template - Raw command template containing portable asset tokens.
 * @param assetsDir - Absolute templates directory.
 * @returns The inlined text plus any unresolved references.
 */
export async function inlineAssetReferences(
  template: string,
  assetsDir: string,
): Promise<InlineAssetResult> {
  const pattern = new RegExp(`@${ASSET_REFERENCE_TOKEN}/([^\\s]+)`, 'g');
  const tokens = [...template.matchAll(pattern)];
  const missing: string[] = [];
  let text = template;
  for (const token of tokens) {
    const relative = token[1];
    const absolute = join(assetsDir, relative);
    try {
      const content = await readFile(absolute, 'utf8');
      text = text.replaceAll(token[0], content.trim());
    } catch {
      missing.push(relative);
      text = text.replaceAll(token[0], `@${absolute}`);
    }
  }
  return { text, missing };
}
