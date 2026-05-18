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
  shims: false,
  // No shebang — extension/scripts use `node dist/index.js` (see bundle-cli / CliService).
  // npm `bin` field runs the file via node on all platforms.
  // Keep these external so they resolve from the install location
  external: [],
  esbuildOptions(options) {
    options.platform = 'node';
  },
});
