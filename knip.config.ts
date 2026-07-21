import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts!', 'src/cli/install.ts!'],
  project: ['src/**/*.ts!', '!src/**/*.test.ts'],
  ignoreBinaries: ['opencode'],
};

export default config;
