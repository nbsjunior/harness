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

/** Copy @cursor/sdk (+ platform native package) so dynamic import resolves from cli/dist/index.js */
function copyCursorSdkVendor() {
  const cursorSrc = path.join(root, 'node_modules', '@cursor');
  const cursorDest = path.join(root, 'packages', 'extension', 'cli', 'node_modules', '@cursor');
  if (!fs.existsSync(cursorSrc)) {
    console.warn('[bundle-cli] node_modules/@cursor missing — run npm install at repo root');
    return;
  }
  copyDirRecursive(cursorSrc, cursorDest);

  const sdkRoot = path.join(cursorSrc, 'sdk');
  const pkgPath = path.join(sdkRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return;
  }
  const sdkPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const optional = sdkPkg.optionalDependencies ?? {};
  for (const dep of Object.keys(optional)) {
    if (!dep.startsWith('@cursor/sdk-')) {
      continue;
    }
    const depSrc = path.join(root, 'node_modules', dep);
    if (fs.existsSync(depSrc)) {
      const depDest = path.join(root, 'packages', 'extension', 'cli', 'node_modules', dep);
      copyDirRecursive(depSrc, depDest);
    }
  }

  for (const dep of ['@bufbuild/protobuf', '@connectrpc/connect', '@connectrpc/connect-node', 'sqlite3', 'zod']) {
    const depSrc = path.join(root, 'node_modules', dep);
    if (fs.existsSync(depSrc)) {
      const depDest = path.join(root, 'packages', 'extension', 'cli', 'node_modules', dep);
      copyDirRecursive(depSrc, depDest);
    }
  }

  console.log('[bundle-cli] Copied @cursor/sdk vendor → packages/extension/cli/node_modules/@cursor/');
}

copyCursorSdkVendor();

console.log(`[bundle-cli] Copied CLI → packages/extension/cli/dist/ (${fs.statSync(path.join(destDir, 'index.js')).size} bytes)`);
