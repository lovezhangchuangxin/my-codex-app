import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: false,
});
