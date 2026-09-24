import { describe, expect, it } from 'vitest';
import { ASSET_REFERENCE_TOKEN, rewriteAssetReferences } from './template-rewriter.js';

const ASSETS_DIR = '/abs/path/to/assets';

describe('ASSET_REFERENCE_TOKEN', () => {
  it('is the documented portable token', () => {
    expect(ASSET_REFERENCE_TOKEN).toBe('opencode-sdd-templates');
  });
});

describe('rewriteAssetReferences', () => {
  it('replaces the token prefix with the absolute assets dir', () => {
    const template = `Body text.
@opencode-sdd-templates/sdd-spec/plan-template.md
More text.`;

    const result = rewriteAssetReferences(template, ASSETS_DIR);

    expect(result).toBe(`Body text.
@${ASSETS_DIR}/sdd-spec/plan-template.md
More text.`);
  });

  it('replaces every occurrence when the token appears multiple times', () => {
    const template = [
      '@opencode-sdd-templates/sdd-spec/plan-template.md',
      'between',
      '@opencode-sdd-templates/sdd-validate/validation-report-template.md',
    ].join('\n');

    const result = rewriteAssetReferences(template, ASSETS_DIR);

    expect(result).toBe(
      [
        `@${ASSETS_DIR}/sdd-spec/plan-template.md`,
        'between',
        `@${ASSETS_DIR}/sdd-validate/validation-report-template.md`,
      ].join('\n'),
    );
    expect(result).not.toContain(ASSET_REFERENCE_TOKEN);
  });

  it('returns the template unchanged when the token is absent', () => {
    const template = 'No token here.\nJust plain text with $ARGUMENTS.';

    const result = rewriteAssetReferences(template, ASSETS_DIR);

    expect(result).toBe(template);
  });

  it('leaves a bare token without a trailing slash untouched', () => {
    const template = 'See @opencode-sdd-templates for details.';

    const result = rewriteAssetReferences(template, ASSETS_DIR);

    expect(result).toBe(template);
  });

  it('preserves the rest of the path after the token', () => {
    const template = '@opencode-sdd-templates/deep/nested/path/file.md';

    const result = rewriteAssetReferences(template, ASSETS_DIR);

    expect(result).toBe(`@${ASSETS_DIR}/deep/nested/path/file.md`);
  });
});
