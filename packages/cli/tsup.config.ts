import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  // Needed for the --ipc mode worker that the extension host spawns
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Keep these external so they resolve from the install location
  external: [],
  esbuildOptions(options) {
    options.platform = 'node';
  },
});
