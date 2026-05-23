#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'cli', 'vendor', '.wiki-publish']);
const SKIP_EXT = new Set(['.png', '.jpg', '.vsix']);

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
  let s = fs.readFileSync(f, 'utf8');
  const b = s;
  s = s.replaceAll('.toddspect', '.toddspect');
  s = s.replaceAll('toddspect-', 'toddspect-');
  s = s.replaceAll('toddspect.', 'toddspect.');
  if (s !== b) {
    fs.writeFileSync(f, s);
    n++;
  }
}
console.log(`[fix-toddspectt] ${n} files fixed`);
