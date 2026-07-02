import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSddCommandTool } from './definition.js';
import { AVAILABLE_COMMANDS } from './allowlist.js';

describe('createSddCommandTool', () => {
  let commandsDir: string;
  let templatesDir: string;

  beforeEach(async () => {
    commandsDir = await mkdtemp(join(tmpdir(), 'cmd-def-cmd-'));
    templatesDir = await mkdtemp(join(tmpdir(), 'cmd-def-tpl-'));
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

  function buildTool() {
    return createSddCommandTool({
      resolveCommandsDir: () => commandsDir,
      resolveTemplatesDir: () => templatesDir,
    });
  }

  it('exposes a description that enumerates the allowlist', () => {
    const def = buildTool();
    expect(def.description).toContain(AVAILABLE_COMMANDS);
  });

  it('returns the header + rewritten body for an allowlisted command', async () => {
    const def = buildTool();
    const out = await def.execute({ command: 'prd-validate' }, stubContext());

    expect(out).toBe(
      `Loaded command "prd-validate" from ${join(commandsDir, 'prd-validate.md')}.\n\n` +
        `Load @${templatesDir}/prd-validate/report.md and run.\n`,
    );
  });

  it('returns the error string for a non-allowlisted command and does not throw', async () => {
    const def = buildTool();
    const out = await def.execute({ command: 'prd-write' }, stubContext());

    expect(out).toBe(
      `Error: "prd-write" is not a loadable command. Available commands: ${AVAILABLE_COMMANDS}.`,
    );
  });

  it('returns the error string for an empty argument', async () => {
    const def = buildTool();
    const out = await def.execute({ command: '' }, stubContext());

    expect(out).toBe(
      `Error: "" is not a loadable command. Available commands: ${AVAILABLE_COMMANDS}.`,
    );
  });

  it('returns the error string when the source file is missing', async () => {
    const def = buildTool();
    const out = await def.execute({ command: 'prd-review-plan' }, stubContext());

    expect(out).toBe(
      `Error: "prd-review-plan" is not a loadable command. Available commands: ${AVAILABLE_COMMANDS}.`,
    );
  });

  it('does not inline the referenced template file (only rewrites the token)', async () => {
    const def = buildTool();
    const out = (await def.execute({ command: 'prd-validate' }, stubContext())) as string;

    expect(out).toContain(`@${templatesDir}/prd-validate/report.md`);
    expect(out).not.toContain('@opencode-sdd-templates/');
  });
});

/** Minimal `ToolContext` stub — the tool does not read any of its fields today. */
function stubContext(): never {
  return undefined as never;
}
