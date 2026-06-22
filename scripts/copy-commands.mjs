import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const markdownSrc = join(root, 'src', 'commands', 'markdown');
const markdownDest = join(root, 'build', 'commands', 'markdown');
const assetsSrc = join(root, 'src', 'assets');
const assetsDest = join(root, 'build', 'assets');

mkdirSync(dirname(markdownDest), { recursive: true });
rmSync(markdownDest, { recursive: true, force: true });
cpSync(markdownSrc, markdownDest, {
  recursive: true,
});
console.log(`copied markdown commands to ${markdownDest}`);

mkdirSync(assetsDest, { recursive: true });
rmSync(assetsDest, { recursive: true, force: true });
cpSync(assetsSrc, assetsDest, { recursive: true });
console.log(`copied template assets to ${assetsDest}`);
