/**
 * Runtime rewriting of the portable `@opencode-sdd-templates/` token into
 * absolute-path `@<assetsDir>/` mentions that opencode natively inlines.
 *
 * Command Markdown source files embed bundled template assets using the
 * portable token `@opencode-sdd-templates/<subdir>/<file>.md`. The token is
 * environment-independent (no absolute path baked in), so the same source
 * ships in every build. The absolute assets directory is only known at
 * runtime — it is computed by `resolveAssetsDir()` in the plugin entry — so
 * the `config` hook rewrites each loaded command template at registration
 * time, replacing the token with the resolved absolute assets directory.
 *
 * opencode's `resolvePromptParts` (`packages/opencode/src/session/prompt.ts`)
 * resolves `@<absolute-path>` mentions by passing the path through
 * `path.resolve(ctx.worktree, name)` unchanged (an absolute path wins), then
 * inlines the file content via the `read` tool with `bypassCwdCheck: true`.
 * That makes absolute-path mentions the correct, working mechanism for
 * embedding bundled assets — no reference registration required.
 */

/**
 * The portable token used in command `.md` files as
 * `@opencode-sdd-templates/<subdir>/<file>.md`.
 *
 * Kept here as the single source of truth so both the rewriter and tests
 * reference one constant. Command Markdown source files embed the token
 * literally; only the rewrite target (the absolute assets directory) is
 * computed at runtime.
 *
 * @internal Exported for tests only; not part of the public module API.
 *   Production code consumes it via {@link rewriteAssetReferences}.
 */
export const ASSET_REFERENCE_TOKEN = 'opencode-sdd-templates';

/**
 * Rewrite every `@${ASSET_REFERENCE_TOKEN}/` occurrence in `template` to an
 * absolute-path `@<assetsDir>/` mention that opencode inlines natively.
 *
 * Only the `@<token>/` prefix (with trailing slash) is matched, so a bare
 * `@opencode-sdd-templates` without a trailing slash is left untouched.
 * Occurrences with no token at all are returned unchanged.
 *
 * @param template - The loaded command template string (with `$ARGUMENTS`
 *   and `@opencode-sdd-templates/...` mentions still in portable form).
 * @param assetsDir - Absolute path to the bundled assets directory, as
 *   computed by `resolveAssetsDir()` in the plugin entry. The caller
 *   guarantees this is absolute; `path.resolve` in opencode's
 *   `resolvePromptParts` treats it as a passthrough, so the resulting
 *   `@<assetsDir>/...` mention resolves to the real file.
 * @returns The template with every `@opencode-sdd-templates/` replaced by
 *   `@<assetsDir>/`.
 */
export function rewriteAssetReferences(template: string, assetsDir: string): string {
  return template.replaceAll(`@${ASSET_REFERENCE_TOKEN}/`, `@${assetsDir}/`);
}
