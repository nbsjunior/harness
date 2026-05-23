#!/usr/bin/env node
/** Update GitHub URLs to nbsjunior/todd */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'cli', 'vendor', '.wiki-publish']);
const SKIP_EXT = new Set(['.png', '.jpg', '.vsix', '.woff']);

const REPLACEMENTS = [
  ['https://github.com/nbsjunior/ToddSpect.wiki.git', 'https://github.com/nbsjunior/todd.wiki.git'],
  ['https://github.com/nbsjunior/toddspect.wiki.git', 'https://github.com/nbsjunior/todd.wiki.git'],
  ['github.com/nbsjunior/ToddSpect', 'github.com/nbsjunior/todd'],
  ['github.com/nbsjunior/toddspect', 'github.com/nbsjunior/todd'],
  ['github.com/nbsjunior/harness', 'github.com/nbsjunior/todd'],
  ['nbsjunior/ToddSpect', 'nbsjunior/todd'],
  ['nbsjunior/toddspect', 'nbsjunior/todd'],
  ['nbsjunior/harness', 'nbsjunior/todd'],
];

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (!SKIP_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

let n = 0;
for (const f of walk(root)) {
  if (f.includes('update-github-urls')) continue;
  let s = fs.readFileSync(f, 'utf8');
  const b = s;
  for (const [a, b2] of REPLACEMENTS) s = s.split(a).join(b2);
  if (s !== b) {
    fs.writeFileSync(f, s);
    n++;
  }
}
console.log(`[update-github-urls] ${n} files updated`);
