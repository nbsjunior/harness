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

const cliPkg = path.join(root, 'packages', 'extension', 'cli', 'package.json');
if (!fs.existsSync(cliPkg)) {
  fs.writeFileSync(cliPkg, JSON.stringify({ type: 'module', private: true }, null, 2) + '\n');
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

const vendorSrc = path.join(root, 'packages', 'cli', 'vendor', 'aidlc-rules');
const vendorDest = path.join(root, 'packages', 'extension', 'cli', 'vendor', 'aidlc-rules');
if (fs.existsSync(vendorSrc)) {
  copyDirRecursive(vendorSrc, vendorDest);
  console.log('[bundle-cli] Copied AI-DLC vendor rules → packages/extension/cli/vendor/aidlc-rules/');
} else {
  console.warn('[bundle-cli] vendor/aidlc-rules missing — run aidlc rules setup in packages/cli/vendor');
}

console.log(`[bundle-cli] Copied CLI → packages/extension/cli/dist/ (${fs.statSync(path.join(destDir, 'index.js')).size} bytes)`);
