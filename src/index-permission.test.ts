import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Config, PluginInput } from '@opencode-ai/plugin';
import sddPlugin from './index.js';
import { permissionRecord, pluginInput, withCommandsDir } from '../test/plugin-helpers.js';

/**
 * Create a temp templates directory (with a single placeholder template),
 * set `SDD_TEMPLATES_DIR` for the callback's duration, then clean up. The
 * resolved glob the plugin grants is `${dir}/**`, so a temp dir keeps the
 * assertions deterministic and independent of the real bundled layout.
 *
 * @param fn - Test body that receives the templates directory path.
 */
async function withTemplatesDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'templates-perm-'));
  await mkdir(join(dir, 'prd-write'), { recursive: true });
  await writeFile(join(dir, 'prd-write', 'prd-template.md'), 'placeholder\n');
  process.env['SDD_TEMPLATES_DIR'] = dir;
  try {
    await fn(dir);
  } finally {
    delete process.env['SDD_TEMPLATES_DIR'];
    await rm(dir, { recursive: true, force: true });
  }
}

/** The `external_directory` rule as a path-glob map, or `undefined`. */
function externalDirectoryMap(config: Config): Record<string, string> | undefined {
  const ext = permissionRecord(config)?.external_directory;
  if (ext !== null && typeof ext === 'object') {
    return ext as Record<string, string>;
  }
  return undefined;
}

/** True when a warn log carrying `message` was emitted by `input`. */
function warnedWith(input: PluginInput, message: string): boolean {
  return vi.mocked(input.client.app.log).mock.calls.some((call) => {
    const body = (call[0] as { body?: { level?: string; message?: string } }).body;
    return body?.level === 'warn' && body?.message === message;
  });
}

describe('sdd plugin bundled templates external_directory permission', () => {
  it('grants an external_directory allow-rule for the resolved templates dir', async () => {
    await withTemplatesDir(async (templatesDir) => {
      await withCommandsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {};
        await hooks.config?.(config);

        expect(externalDirectoryMap(config)).toEqual({
          [`${templatesDir}/**`]: 'allow',
        });
      });
    });
  });

  it('preserves existing user permission categories via spread-merge', async () => {
    await withTemplatesDir(async (templatesDir) => {
      await withCommandsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = { permission: { edit: 'allow', bash: 'ask' } };
        await hooks.config?.(config);

        expect(permissionRecord(config)?.edit).toBe('allow');
        expect(permissionRecord(config)?.bash).toBe('ask');
        expect(externalDirectoryMap(config)).toEqual({
          [`${templatesDir}/**`]: 'allow',
        });
      });
    });
  });

  it('preserves an existing external_directory path-glob map and adds ours', async () => {
    await withTemplatesDir(async (templatesDir) => {
      await withCommandsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {
          // object-form external_directory is not modeled by the root SDK
          // type, so cast through `unknown` (the runtime and v2 type accept it).
          permission: {
            external_directory: { '/some/user/path/**': 'deny' },
          } as unknown as Config['permission'],
        };
        await hooks.config?.(config);

        expect(externalDirectoryMap(config)).toEqual({
          '/some/user/path/**': 'deny',
          [`${templatesDir}/**`]: 'allow',
        });
      });
    });
  });

  it('replaces a string external_directory "ask" with a map granting our glob', async () => {
    await withTemplatesDir(async (templatesDir) => {
      await withCommandsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = { permission: { external_directory: 'ask' } };
        await hooks.config?.(config);

        expect(externalDirectoryMap(config)).toEqual({
          [`${templatesDir}/**`]: 'allow',
        });
      });
    });
  });

  it('is a no-op when external_directory is already "allow"', async () => {
    await withTemplatesDir(async () => {
      await withCommandsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = { permission: { external_directory: 'allow' } };
        await hooks.config?.(config);

        // Left untouched as a plain action string; no path-glob map added.
        expect(permissionRecord(config)?.external_directory).toBe('allow');
        expect(externalDirectoryMap(config)).toBeUndefined();
      });
    });
  });

  it('warns and skips when external_directory is "deny"', async () => {
    await withTemplatesDir(async () => {
      await withCommandsDir(async () => {
        const input = pluginInput();
        const hooks = await sddPlugin(input);
        const config: Config = { permission: { external_directory: 'deny' } };
        await hooks.config?.(config);

        // Strict posture left untouched (must not loosen other dirs to ask).
        expect(permissionRecord(config)?.external_directory).toBe('deny');
        expect(externalDirectoryMap(config)).toBeUndefined();
        expect(
          warnedWith(input, 'cannot grant templates access: external_directory is "deny"'),
        ).toBe(true);
      });
    });
  });

  it('is a no-op when permission is a global "allow" string', async () => {
    await withTemplatesDir(async () => {
      await withCommandsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {
          // A top-level string permission is accepted by the runtime but not
          // modeled by the root SDK type; cast through `unknown`.
          permission: 'allow' as unknown as Config['permission'],
        };
        await hooks.config?.(config);

        expect(config.permission).toBe('allow');
        expect(externalDirectoryMap(config)).toBeUndefined();
      });
    });
  });

  it('warns and skips when permission is a global "deny" string', async () => {
    await withTemplatesDir(async () => {
      await withCommandsDir(async () => {
        const input = pluginInput();
        const hooks = await sddPlugin(input);
        const config: Config = {
          permission: 'deny' as unknown as Config['permission'],
        };
        await hooks.config?.(config);

        // Global strict posture left untouched.
        expect(config.permission).toBe('deny');
        expect(externalDirectoryMap(config)).toBeUndefined();
        expect(
          warnedWith(input, 'cannot grant templates access: permission is a global string'),
        ).toBe(true);
      });
    });
  });
});
