#!/usr/bin/env node
/**
 * Rebrand extension UI: Harness / ToddSpect → Todd (user-visible strings).
 * Keeps command ids (toddspect.*), settings keys, and npm package name.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Code symbols — protect from display-name replacement, then optionally rename. */
const CODE_RENAMES = [
  ['ToddSpectSnapshotProvider', 'ToddSnapshotProvider'],
  ['buildToddSpectProcessEnv', 'buildToddProcessEnv'],
  ['resolveToddSpectWorkspacePath', 'resolveToddWorkspacePath'],
];

const SKIP = new Set(['node_modules', 'dist', 'out', '.git']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (/\.(ts|json|html|md)$/.test(name)) out.push(abs);
  }
  return out;
}

function rebrandText(text) {
  let s = text;
  for (const [from, to] of CODE_RENAMES) {
    s = s.split(from).join(`\0${to}\0`);
  }
  s = s.replace(/\bHarness\b/g, 'Todd');
  s = s.replace(/\bToddSpect\b/g, 'Todd');
  for (const [, to] of CODE_RENAMES) {
    s = s.split(`\0${to}\0`).join(to);
  }
  return s;
}

const extRoot = path.join(root, 'packages/extension');
const files = walk(extRoot);

let updated = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = rebrandText(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    updated++;
    console.log('  ext', path.relative(root, file));
  }
}

// Rename snapshot provider file
const oldProvider = path.join(extRoot, 'src/services/ToddSpectSnapshotProvider.ts');
const newProvider = path.join(extRoot, 'src/services/ToddSnapshotProvider.ts');
if (fs.existsSync(oldProvider) && !fs.existsSync(newProvider)) {
  fs.renameSync(oldProvider, newProvider);
  console.log('  renamed ToddSpectSnapshotProvider.ts → ToddSnapshotProvider.ts');
}

// CLI user-visible strings (bundled in extension)
const cliFiles = walk(path.join(root, 'packages/cli/src')).filter(
  (f) => !f.includes(`${path.sep}vendor${path.sep}`),
);
cliFiles.push(path.join(root, 'packages/cli/web/public/index.html'));

for (const file of cliFiles) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of CODE_RENAMES) {
    after = after.split(from).join(`\0${to}\0`);
  }
  // Protect type/function names that must stay for now
  const keep = [
    'loadToddSpectConfig',
    'LoadedToddSpectConfig',
    'ToddSpectConfigFile',
    'ToddSpectSettingsBridge',
    'ToddSpectPromptSettings',
    'ToddSpectPluginManifest',
    'ToddSpectPluginRegistry',
    'sessionByToddSpectId',
    'extractToddSpectContextBlocks',
    'buildToddSpectSystemGuidance',
    'mergeToddSpectSystemGuidance',
    'hasToddSpectDir',
  ];
  const placeholders = new Map();
  keep.forEach((sym, i) => {
    const ph = `\0KEEP${i}\0`;
    placeholders.set(ph, sym);
    after = after.split(sym).join(ph);
  });
  after = after.replace(/\bHarness of AI\b/g, 'Todd of AIDLC');
  after = after.replace(/\bHarness\b/g, 'Todd');
  after = after.replace(/\bToddSpect\b/g, 'Todd');
  for (const [ph, sym] of placeholders) {
    after = after.split(ph).join(sym);
  }
  for (const [, to] of CODE_RENAMES) {
    after = after.split(`\0${to}\0`).join(to);
  }
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    updated++;
    console.log('  cli', path.relative(root, file));
  }
}

console.log(`[rebrand-ui-todd] ${updated} files updated`);
