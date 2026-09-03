import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isDirectInvocation } from './bin-entry.js';

/**
 * Probe whether this platform permits creating symlinks (Windows
 * runners without Developer Mode reject them with EPERM). Tests that
 * rely on a symlink are skipped when the probe fails — the real-path
 * cases still cover the comparison logic.
 */
function hasSymlinkSupport(): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'opencode-sdd-bin-entry-'));
  try {
    const target = join(dir, 'target.txt');
    const link = join(dir, 'link.txt');
    writeFileSync(target, 'probe');
    symlinkSync(target, link);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const symlinkSupported = hasSymlinkSupport();
const modulePath = fileURLToPath(import.meta.url);

describe('isDirectInvocation', () => {
  it('is true for the module path itself (direct `node <script>`)', () => {
    expect(isDirectInvocation(import.meta.url, modulePath)).toBe(true);
  });

  it('is false when no entry path was given (e.g. `node -e ...`)', () => {
    expect(isDirectInvocation(import.meta.url, undefined)).toBe(false);
  });

  it('is false for a different file', () => {
    const other = mkdtempSync(join(tmpdir(), 'opencode-sdd-bin-entry-'));
    try {
      const otherModule = join(other, 'other.js');
      writeFileSync(otherModule, '');
      expect(isDirectInvocation(import.meta.url, otherModule)).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('is false for a missing entry path (never throws)', () => {
    expect(isDirectInvocation(import.meta.url, join(tmpdir(), 'does-not-exist.js'))).toBe(false);
  });

  it.skipIf(!symlinkSupported)(
    'is true for a symlinked entry path (npm `node_modules/.bin` shims)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'opencode-sdd-bin-entry-'));
      try {
        // Same shape as npm's POSIX `.bin` entry: a symlink whose
        // resolved target is the real module file.
        const link = join(dir, 'opencode-sdd');
        symlinkSync(modulePath, link);
        expect(isDirectInvocation(import.meta.url, link)).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!symlinkSupported)(
    'is false for a symlinked entry pointing at a different file',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'opencode-sdd-bin-entry-'));
      try {
        const other = join(dir, 'other.js');
        const link = join(dir, 'opencode-sdd');
        writeFileSync(other, '');
        symlinkSync(other, link);
        expect(isDirectInvocation(import.meta.url, link)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
