import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCommandFile } from './frontmatter-parser.js';

const markdownDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'commands');

describe('prd-write command file', () => {
  it('embeds the templates reference for its PRD template', async () => {
    const raw = await readFile(join(markdownDir, 'prd-write.md'), 'utf8');
    const result = parseCommandFile('prd-write', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-write/prd-template.md',
      );
      expect(result.command.config.template).toContain('subagent_type: "explore"');
    }
  });
});

describe('sdd-spec command file', () => {
  it('parses with a description, $ARGUMENTS, and the plan/task template references', async () => {
    const raw = await readFile(join(markdownDir, 'sdd-spec.md'), 'utf8');
    const result = parseCommandFile('sdd-spec', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('@opencode-sdd-templates/sdd-spec/plan-template.md');
      expect(template).toContain('@opencode-sdd-templates/sdd-spec/task-structure-template.md');
      expect(template).toContain('subagent_type: "explore"');
      const asset = await readFile(
        join(markdownDir, 'templates', 'sdd-spec', 'plan-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('sdd-implement command file', () => {
  it('parses with a description, $ARGUMENTS, and references the spec file', async () => {
    const raw = await readFile(join(markdownDir, 'sdd-implement.md'), 'utf8');
    const result = parseCommandFile('sdd-implement', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('spec.md');
    }
  });
});

describe('sdd-validate command file', () => {
  it('parses with a description, $ARGUMENTS, and the validation template references', async () => {
    const raw = await readFile(join(markdownDir, 'sdd-validate.md'), 'utf8');
    const result = parseCommandFile('sdd-validate', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain(
        '@opencode-sdd-templates/sdd-validate/validation-report-template.md',
      );
      expect(template).toContain('validation.md');
      expect(template).toContain('subagent_type: "explore"');
    }
  });
});

describe('prd-to-issues command file', () => {
  it('parses with a description, $ARGUMENTS, and the inline issue template', async () => {
    const raw = await readFile(join(markdownDir, 'prd-to-issues.md'), 'utf8');
    const result = parseCommandFile('prd-to-issues', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('## Issue Template');
      expect(template).toContain('# Issue: [TITLE]');
      expect(template).toContain('subagent_type: "explore"');
    }
  });
});

describe('prd-issue-to-plan command file', () => {
  it('parses with a description, $ARGUMENTS, and the shared plan template reference', async () => {
    const raw = await readFile(join(markdownDir, 'prd-issue-to-plan.md'), 'utf8');
    const result = parseCommandFile('prd-issue-to-plan', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-issue-to-plan/plan-template.md',
      );
      expect(result.command.config.template).toContain('plan.md');
      expect(result.command.config.template).toContain('subagent_type: "explore"');
      const asset = await readFile(
        join(markdownDir, 'templates', 'prd-issue-to-plan', 'plan-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('prd-implement-issue command file', () => {
  it('parses with a description, $ARGUMENTS, and references the issue plan', async () => {
    const raw = await readFile(join(markdownDir, 'prd-implement-issue.md'), 'utf8');
    const result = parseCommandFile('prd-implement-issue', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain('plan.md');
      expect(result.command.config.template).toContain('Blocked by');
    }
  });
});

describe('prd-validate-issue command file', () => {
  it('parses with a description, $ARGUMENTS, and the shared validation template reference', async () => {
    const raw = await readFile(join(markdownDir, 'prd-validate-issue.md'), 'utf8');
    const result = parseCommandFile('prd-validate-issue', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-validate-issue/validation-report-template.md',
      );
      expect(result.command.config.template).toContain('validation.md');
      expect(result.command.config.template).toContain('subagent_type: "explore"');
      const asset = await readFile(
        join(markdownDir, 'templates', 'prd-validate-issue', 'validation-report-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('prd-review-plan command file', () => {
  it('parses with a description, $ARGUMENTS, and the review report template reference', async () => {
    const raw = await readFile(join(markdownDir, 'prd-review-plan.md'), 'utf8');
    const result = parseCommandFile('prd-review-plan', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-review-plan/review-report-template.md',
      );
      expect(result.command.config.template).toContain('review.md');
      expect(result.command.config.template).toContain('explore');
      const asset = await readFile(
        join(markdownDir, 'templates', 'prd-review-plan', 'review-report-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('prd-validate command file', () => {
  it('parses with a description, $ARGUMENTS, and the cross-cutting validation template reference', async () => {
    const raw = await readFile(join(markdownDir, 'prd-validate.md'), 'utf8');
    const result = parseCommandFile('prd-validate', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-validate/validation-report-template.md',
      );
      expect(result.command.config.template).toContain('validation.md');
      expect(result.command.config.template).toContain('subagent_type: "explore"');
      const asset = await readFile(
        join(markdownDir, 'templates', 'prd-validate', 'validation-report-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('doc-readme command file', () => {
  it('parses with a description, $ARGUMENTS, and the README template references', async () => {
    const raw = await readFile(join(markdownDir, 'doc-readme.md'), 'utf8');
    const result = parseCommandFile('doc-readme', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('README.md');
      expect(template).toContain('@opencode-sdd-templates/doc-readme/readme-library.md');
      expect(template).toContain('@opencode-sdd-templates/doc-readme/readme-generic.md');
      expect(template).toContain('subagent_type: "explore"');
      const asset = await readFile(
        join(markdownDir, 'templates', 'doc-readme', 'readme-library.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('doc-changelog command file', () => {
  it('parses with a description, $ARGUMENTS, and the Unreleased focus', async () => {
    const raw = await readFile(join(markdownDir, 'doc-changelog.md'), 'utf8');
    const result = parseCommandFile('doc-changelog', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain('CHANGELOG.md');
      expect(result.command.config.template).toContain('Unreleased');
    }
  });
});

describe('doc-deployment command file', () => {
  it('parses with a description, $ARGUMENTS, and a DEPLOYMENT focus', async () => {
    const raw = await readFile(join(markdownDir, 'doc-deployment.md'), 'utf8');
    const result = parseCommandFile('doc-deployment', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain('DEPLOYMENT.md');
      expect(result.command.config.template).toContain('subagent_type: "explore"');
    }
  });
});

describe('doc-development command file', () => {
  it('parses with a description, $ARGUMENTS, and a DEVELOPMENT focus', async () => {
    const raw = await readFile(join(markdownDir, 'doc-development.md'), 'utf8');
    const result = parseCommandFile('doc-development', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain('DEVELOPMENT.md');
      expect(result.command.config.template).toContain('subagent_type: "explore"');
    }
  });
});

describe('doc-agents command file', () => {
  it('parses with a description, $ARGUMENTS, and the full set of asset references', async () => {
    const raw = await readFile(join(markdownDir, 'doc-agents.md'), 'utf8');
    const result = parseCommandFile('doc-agents', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('AGENTS.md');
      expect(template).toContain('@opencode-sdd-templates/doc-agents/system-design-web-service.md');
      expect(template).toContain('@opencode-sdd-templates/doc-agents/architecture-example.md');
      expect(template).toContain('@opencode-sdd-templates/doc-agents/markdown-formatting-rules.md');
      expect(template).toContain(
        '@opencode-sdd-templates/doc-agents/contribution-instructions-example.md',
      );
      expect(template).toContain('subagent_type: "explore"');
      const assetsDir = join(markdownDir, 'templates', 'doc-agents');
      const exampleAsset = await readFile(
        join(assetsDir, 'contribution-instructions-example.md'),
        'utf8',
      );
      const systemDesignAsset = await readFile(
        join(assetsDir, 'system-design-web-service.md'),
        'utf8',
      );
      expect(exampleAsset.trim()).not.toBe('');
      expect(systemDesignAsset.trim()).not.toBe('');
    }
  });
});
