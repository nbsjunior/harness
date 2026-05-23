#!/usr/bin/env node
/**
 * Copies the compiled ToddSpect CLI into the extension package so it ships
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

/** Parse `name` or `@scope/name` from an npm version range spec. */
function parsePackageName(spec) {
  if (!spec || typeof spec !== 'string') {
    return '';
  }
  if (spec.startsWith('@')) {
    const slash = spec.indexOf('/', 1);
    if (slash === -1) {
      return spec;
    }
    const at = spec.indexOf('@', slash + 1);
    return at === -1 ? spec : spec.slice(0, at);
  }
  const at = spec.indexOf('@');
  return at === -1 ? spec : spec.slice(0, at);
}

/** Only bundle the @cursor/sdk-* optional native package for the build host OS/arch. */
function cursorPlatformPackageForHost(depName) {
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch;
  const platform =
    process.platform === 'win32'
      ? 'win32'
      : process.platform === 'darwin'
        ? 'darwin'
        : process.platform === 'linux'
          ? 'linux'
          : process.platform;
  return depName === `@cursor/sdk-${platform}-${arch}`;
}

function packageDir(nmRoot, name) {
  if (!name) {
    return null;
  }
  if (name.startsWith('@')) {
    const parts = name.split('/');
    if (parts.length !== 2) {
      return null;
    }
    return path.join(nmRoot, parts[0], parts[1]);
  }
  return path.join(nmRoot, name);
}

/** Collect transitive runtime deps for @cursor/sdk (hoisted + nested package.json). */
function collectCursorSdkDependencyNames(nmRoot) {
  const names = new Set();
  const queue = ['@cursor/sdk'];
  const visitedDirs = new Set();

  function enqueue(name) {
    if (!name || names.has(name)) {
      return;
    }
    names.add(name);
    queue.push(name);
  }

  function walkPackageJson(pkgDir) {
    if (!pkgDir || visitedDirs.has(pkgDir)) {
      return;
    }
    const pkgPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return;
    }
    visitedDirs.add(pkgDir);

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      return;
    }

    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const block = pkg[section];
      if (!block || typeof block !== 'object') {
        continue;
      }
      for (const depName of Object.keys(block)) {
        if (
          section === 'optionalDependencies' &&
          depName.startsWith('@cursor/sdk-') &&
          !cursorPlatformPackageForHost(depName)
        ) {
          continue;
        }
        enqueue(parsePackageName(depName));
      }
    }

    const nestedNm = path.join(pkgDir, 'node_modules');
    if (!fs.existsSync(nestedNm)) {
      return;
    }
    for (const entry of fs.readdirSync(nestedNm, { withFileTypes: true })) {
      if (entry.name === '.bin') {
        continue;
      }
      if (entry.name.startsWith('@')) {
        const scopePath = path.join(nestedNm, entry.name);
        for (const sub of fs.readdirSync(scopePath, { withFileTypes: true })) {
          if (sub.isDirectory()) {
            walkPackageJson(path.join(scopePath, sub.name));
          }
        }
      } else if (entry.isDirectory()) {
        walkPackageJson(path.join(nestedNm, entry.name));
      }
    }
  }

  while (queue.length > 0) {
    const name = queue.shift();
    walkPackageJson(packageDir(nmRoot, name));
  }

  return names;
}

/** Copy @cursor/sdk and full dependency tree so dynamic import works inside the .vsix */
function copyCursorSdkVendor() {
  const nmRoot = path.join(root, 'node_modules');
  const destNm = path.join(root, 'packages', 'extension', 'cli', 'node_modules');

  if (!fs.existsSync(path.join(nmRoot, '@cursor', 'sdk'))) {
    console.warn('[bundle-cli] node_modules/@cursor/sdk missing — run npm install at repo root');
    return;
  }

  const depNames = collectCursorSdkDependencyNames(nmRoot);
  let copied = 0;
  const missing = [];

  for (const name of [...depNames].sort()) {
    const src = packageDir(nmRoot, name);
    const dest = packageDir(destNm, name);
    if (!src || !fs.existsSync(path.join(src, 'package.json'))) {
      missing.push(name);
      continue;
    }
    copyDirRecursive(src, dest);
    copied += 1;
  }

  const optionalPlatform = missing.filter((n) => n.startsWith('@cursor/sdk-'));
  const requiredMissing = missing.filter((n) => !n.startsWith('@cursor/sdk-'));
  if (optionalPlatform.length > 0) {
    console.log(
      `[bundle-cli] Optional Cursor platform packages skipped (not installed on this OS): ${optionalPlatform.join(', ')}`,
    );
  }
  if (requiredMissing.length > 0) {
    console.warn('[bundle-cli] Cursor SDK deps not found at repo root:', requiredMissing.join(', '));
  }

  console.log(
    `[bundle-cli] Copied @cursor/sdk vendor (${copied} packages) → packages/extension/cli/node_modules/`,
  );
}

copyCursorSdkVendor();

console.log(`[bundle-cli] Copied CLI → packages/extension/cli/dist/ (${fs.statSync(path.join(destDir, 'index.js')).size} bytes)`);
