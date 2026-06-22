import { stat } from 'node:fs/promises';
import type { Logger } from '../utils/index.js';

/**
 * opencode local-reference configuration shape.
 *
 * Matches the local-object form of `Config['references'][string]` in
 * `@opencode-ai/sdk` (`ConfigV2ReferenceLocal`: `{ path, description?,
 * hidden? }`). Not re-exported: it documents the resolver's return type and
 * is consumed structurally by the plugin entry.
 */
interface ReferenceConfig {
  readonly path: string;
  readonly description?: string;
  readonly hidden?: boolean;
}

/**
 * Alias under which the bundled templates reference is registered.
 *
 * Contains no `/`, whitespace, backticks, or commas, satisfying opencode's
 * reference-alias rules. Embed template assets in prompts as
 * `@opencode-sdd-templates/<command>/<file>`.
 */
export const TEMPLATES_REFERENCE_ALIAS = 'opencode-sdd-templates';

/** Description attached to the registered reference. */
const TEMPLATES_REFERENCE_DESCRIPTION = 'opencode-sdd bundled prompt template assets';

/**
 * Compute the `opencode-sdd-templates` reference entry for a bundled assets
 * directory.
 *
 * If `assetsDir` does not exist or is not a directory, logs a warning and
 * returns `undefined` (graceful degradation: commands still register, only
 * `@`-references fail to resolve). Never throws.
 *
 * @param assetsDir - Absolute path to the bundled assets directory.
 * @param logger - Plugin logger used to report a missing/invalid directory.
 * @returns The reference entry, or `undefined` when the directory is absent
 *   or not a directory.
 */
export async function resolveTemplatesReference(
  assetsDir: string,
  logger: Logger,
): Promise<ReferenceConfig | undefined> {
  try {
    const info = await stat(assetsDir);
    if (!info.isDirectory()) {
      await logger.warn('templates assets path is not a directory', {
        assetsDir,
      });
      return undefined;
    }
  } catch (error) {
    await logger.warn('templates assets directory missing or unreadable', {
      assetsDir,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
  return {
    path: assetsDir,
    description: TEMPLATES_REFERENCE_DESCRIPTION,
    hidden: true,
  };
}
