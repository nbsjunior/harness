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
  // Bundle all node_modules into the single dist file so the extension can
  // run the CLI without a separate `npm install` in the extension directory.
  noExternal: [/.*/],
  // Only keep Node built-ins truly external
  external: [
    'fs', 'path', 'os', 'child_process', 'url', 'util', 'stream',
    'events', 'assert', 'net', 'http', 'https', 'crypto', 'zlib',
    'readline', 'tty', 'buffer', 'string_decoder', 'querystring',
    'timers', 'process', 'module', 'vm', 'worker_threads',
  ],
  esbuildOptions(options) {
    options.platform = 'node';
  },
});
