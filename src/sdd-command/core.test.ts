import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSddCommandToolCore } from './core.js';
import { AVAILABLE_COMMANDS } from './allowlist.js';

describe('createSddCommandToolCore', () => {
  let commandsDir: string;
  let templatesDir: string;

  beforeEach(async () => {
    commandsDir = await mkdtemp(join(tmpdir(), 'cmd-core-cmd-'));
    templatesDir = await mkdtemp(join(tmpdir(), 'cmd-core-tpl-'));
    await writeFile(
      join(commandsDir, 'prd-validate.md'),
      [
        '---',
        'description: validate',
        '---',
        '',
        'Load @opencode-sdd-templates/prd-validate/report.md and run.',
        '',
      ].join('\n'),
    );
  });

  afterEach(async () => {
    await rm(commandsDir, { recursive: true, force: true });
    await rm(templatesDir, { recursive: true, force: true });
  });

  function buildCore() {
    return createSddCommandToolCore({
      resolveCommandsDir: () => commandsDir,
      resolveTemplatesDir: () => templatesDir,
    });
  }

  it('exposes the description listing every allowed command', () => {
    const core = buildCore();
    expect(core.description).toContain(AVAILABLE_COMMANDS);
  });

  it('exposes a JSON Schema input and a legacy V1 args fragment', () => {
    const core = buildCore();
    expect(core.inputSchema).toEqual({
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Name of the command to load; must be one of: ' + AVAILABLE_COMMANDS + '.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    });
    expect(core.legacyArgs).toEqual({
      command: {
        type: 'string',
        description: 'Name of the command to load; must be one of: ' + AVAILABLE_COMMANDS + '.',
      },
    });
  });

  it('loads an allowlisted command and rewrites the portable token', async () => {
    const output = await buildCore().execute({ command: 'prd-validate' });

    expect(output).toContain('Loaded command "prd-validate" from ');
    expect(output).toContain('@' + templatesDir + '/prd-validate/report.md');
    expect(output).not.toContain('@opencode-sdd-templates/');
  });

  it('reports a not-allowlisted command without loading it', async () => {
    const output = await buildCore().execute({ command: 'prd-write' });

    expect(output).toContain('is not a loadable command');
    expect(output).toContain('Available commands:');
    expect(output).not.toContain('Loaded command');
  });

  it('reports an empty command as a load error', async () => {
    const output = await buildCore().execute({ command: '' });
    expect(output).toContain('is not a loadable command');
  });

  it('reports a missing command file', async () => {
    const output = await buildCore().execute({ command: 'prd-issue-to-plan' });
    expect(output).toContain('is not a loadable command');
  });

  it('handles malformed tool input without throwing', async () => {
    await expect(buildCore().execute(undefined)).resolves.toContain('is not a loadable command');
    await expect(buildCore().execute(null)).resolves.toContain('is not a loadable command');
    await expect(buildCore().execute('prd-validate')).resolves.toContain(
      'is not a loadable command',
    );
  });
});
