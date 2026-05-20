// @ts-check
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

const commonOptions = {
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  ...commonOptions,
  entryPoints: ['src/extension.ts'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: [
    'vscode',
    // execa is ESM-only; keep it external for the extension host
    // and require via dynamic import at runtime
  ],
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
};

/** @type {esbuild.BuildOptions} */
const chatWebviewConfig = {
  ...commonOptions,
  entryPoints: ['src/webview/chat/main.ts'],
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/webview/chat/main.js',
  external: [],
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
};

/** @type {esbuild.BuildOptions} */
const specWebviewConfig = {
  ...commonOptions,
  entryPoints: ['src/webview/spec/main.ts'],
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/webview/spec/main.js',
  external: [],
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
};

/** @type {esbuild.BuildOptions} */
const configWebviewConfig = {
  ...commonOptions,
  entryPoints: ['src/webview/config/main.ts'],
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/webview/config/main.js',
  external: [],
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
};

/** @type {esbuild.BuildOptions} */
const liveEditsWebviewConfig = {
  ...commonOptions,
  entryPoints: ['src/webview/live-edits/main.ts'],
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/webview/live-edits/main.js',
  external: [],
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
};

/** @type {esbuild.BuildOptions} */
const manualWebviewConfig = {
  ...commonOptions,
  entryPoints: ['src/webview/manual/main.ts'],
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/webview/manual/main.js',
  external: [],
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
};

async function build() {
  if (isWatch) {
    const [extCtx, chatCtx, specCtx, configCtx, manualCtx, liveEditsCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(chatWebviewConfig),
      esbuild.context(specWebviewConfig),
      esbuild.context(configWebviewConfig),
      esbuild.context(manualWebviewConfig),
      esbuild.context(liveEditsWebviewConfig),
    ]);

    await Promise.all([
      extCtx.watch(),
      chatCtx.watch(),
      specCtx.watch(),
      configCtx.watch(),
      manualCtx.watch(),
      liveEditsCtx.watch(),
    ]);

    console.log('[esbuild] Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(chatWebviewConfig),
      esbuild.build(specWebviewConfig),
      esbuild.build(configWebviewConfig),
      esbuild.build(manualWebviewConfig),
      esbuild.build(liveEditsWebviewConfig),
    ]);

    console.log('[esbuild] Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
