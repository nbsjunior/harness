#!/usr/bin/env node
/**
 * Copies the compiled Harness CLI into the extension package so it ships
 * inside the .vsix (extension/cli/dist/index.js).
 *
 * Run from monorepo root after `npm run build:cli`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const srcDir = path.join(root, 'packages', 'cli', 'dist');
const destDir = path.join(root, 'packages', 'extension', 'cli', 'dist');

const srcIndex = path.join(srcDir, 'index.js');

if (!fs.existsSync(srcIndex)) {
  console.error('[bundle-cli] CLI not built. Run: npm run build:cli');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith('.map')) {
    continue;
  }
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log(`[bundle-cli] Copied CLI → packages/extension/cli/dist/ (${fs.statSync(path.join(destDir, 'index.js')).size} bytes)`);
