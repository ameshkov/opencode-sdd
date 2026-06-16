import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts!'],
  project: ['src/**/*.ts!', '!src/**/*.test.ts'],
};

export default config;
