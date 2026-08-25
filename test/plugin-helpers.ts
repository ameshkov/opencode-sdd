import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config, PluginInput } from '@opencode-ai/plugin';
import { stubClient } from './stub-client.js';

/**
 * Builds a {@link PluginInput} with a stubbed SDK client for logging.
 *
 * @returns A plugin input whose `client.app.log` is a vitest mock.
 */
export function pluginInput(): PluginInput {
  return { client: stubClient() } as unknown as PluginInput;
}

/**
 * Create a temp directory pre-populated with every SDD command fixture, set
 * `SDD_COMMANDS_DIR` to it (and `SDD_AGENTS_DIR` to a missing directory to
 * neutralise agent loading) for the callback's duration, then clean up.
 *
 * @param fn - Test body that receives the commands directory path.
 */
export async function withCommandsDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'entry-'));
  const writeCmd = (name: string, description: string) =>
    writeFile(
      join(dir, `${name}.md`),
      [
        '---',
        `description: ${description}`,
        '---',
        '',
        `Command ${name}. Input: $ARGUMENTS`,
        `@opencode-sdd-templates/${name}/template.md`,
        '',
      ].join('\n'),
    );
  await Promise.all([
    writeCmd('prd-write', 'Write a PRD'),
    writeCmd('prd-to-issues', 'Break a PRD into issues'),
    writeCmd('prd-issue-to-plan', 'Plan a PRD issue'),
    writeCmd('prd-review-plan', 'Review a PRD issue plan'),
    writeCmd('prd-implement-issue', 'Implement a PRD issue'),
    writeCmd('prd-validate-issue', 'Validate a PRD issue'),
    writeCmd('prd-validate', 'Validate the full PRD'),
    writeCmd('sdd-spec', 'Produce a spec'),
    writeCmd('sdd-implement', 'Implement a spec'),
    writeCmd('sdd-validate', 'Validate a spec'),
    writeCmd('doc-agents', 'Actualize AGENTS.md'),
    writeCmd('doc-changelog', 'Update CHANGELOG.md'),
    writeCmd('doc-deployment', 'Actualize DEPLOYMENT.md'),
    writeCmd('doc-development', 'Actualize DEVELOPMENT.md'),
    writeCmd('doc-readme', 'Actualize README.md'),
  ]);
  process.env['SDD_COMMANDS_DIR'] = dir;
  // Neutralise agent loading so command tests stay deterministic (they
  // never set SDD_AGENTS_DIR themselves).
  process.env['SDD_AGENTS_DIR'] = join(tmpdir(), 'definitely-missing-agents');
  try {
    await fn(dir);
  } finally {
    delete process.env['SDD_COMMANDS_DIR'];
    delete process.env['SDD_AGENTS_DIR'];
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The merged `permission` object as a loose record, for assertions on keys the
 * SDK type does not model (custom tool names such as `sdd-command`, path-glob
 * maps under `external_directory`).
 *
 * @param config - The config a `config` hook has run against.
 * @returns The permission object as a record, or `undefined` when unset or a
 *   global string posture.
 */
export function permissionRecord(config: Config): Record<string, unknown> | undefined {
  return config.permission as Record<string, unknown> | undefined;
}
