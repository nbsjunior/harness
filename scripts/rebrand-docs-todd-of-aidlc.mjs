#!/usr/bin/env node
/**
 * Rebrand documentation: Harness / ToddSpect → Todd of AIDLC
 * Preserves technical identifiers: toddspect CLI, .toddspect/, settings keys, env vars, VSIX names.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DOC_ROOTS = [
  'README.md',
  'CONTRIBUTING.md',
  'AGENTS.md',
  'docs',
  'wiki',
  'packages/cli/README.md',
  'packages/extension/README.md',
  'packages/extension/CHANGELOG.md',
];

const SKIP_DIR = new Set(['vendor', 'node_modules', '.git']);

function collectMarkdownFiles(entry) {
  const abs = path.join(root, entry);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile() && abs.endsWith('.md')) return [abs];
  if (!stat.isDirectory()) return [];

  const out = [];
  for (const name of fs.readdirSync(abs)) {
    if (SKIP_DIR.has(name)) continue;
    out.push(...collectMarkdownFiles(path.join(entry, name)));
  }
  return out;
}

function rebrandContent(text) {
  let s = text;

  // Path / link renames (before name replacement)
  s = s.replace(/why-toddspect\.md/g, 'why-todd-of-aidlc.md');
  s = s.replace(/Why-ToddSpect/g, 'Why-Todd-of-AIDLC');

  // Display names (longest / possessive first)
  s = s.replace(/\bToddSpect's\b/g, "Todd of AIDLC's");
  s = s.replace(/\bToddSpect\b/g, 'Todd of AIDLC');

  // Historical Harness — skip technical tokens (.harness/, `harness`, was `harness`)
  s = s.replace(/\bHarness\b/g, 'Todd of AIDLC');

  // Lowercase harness only in prose (not paths, commands, env, settings)
  s = s.replace(/\bharness\b/g, (match, offset, str) => {
    const slice = str.slice(Math.max(0, offset - 2), offset + match.length + 24);
    if (/[`./]harness/.test(slice) || /harness[`./]/.test(slice)) return match;
    if (/HARNESS_|harness\./.test(slice)) return match;
    if (/was `harness`/.test(str.slice(offset - 8, offset + 16))) return match;
    return 'Todd of AIDLC';
  });

  return s;
}

const files = DOC_ROOTS.flatMap(collectMarkdownFiles);
let updated = 0;

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = rebrandContent(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    updated++;
    console.log('  updated', path.relative(root, file));
  }
}

const renames = [
  ['docs/why-toddspect.md', 'docs/why-todd-of-aidlc.md'],
  ['wiki/Why-ToddSpect.md', 'wiki/Why-Todd-of-AIDLC.md'],
];

for (const [from, to] of renames) {
  const fromAbs = path.join(root, from);
  const toAbs = path.join(root, to);
  if (fs.existsSync(fromAbs) && !fs.existsSync(toAbs)) {
    fs.renameSync(fromAbs, toAbs);
    console.log('  renamed', from, '→', to);
  }
}

console.log(`[rebrand-docs-todd-of-aidlc] ${updated} files updated`);
