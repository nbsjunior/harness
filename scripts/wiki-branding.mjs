#!/usr/bin/env node
/**
 * Prepend Harness of AI logo to wiki pages (and refresh sidebar branding).
 * Run after adding new wiki/*.md files: node scripts/wiki-branding.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wikiDir = path.join(__dirname, '..', 'wiki');
const iconName = 'harness-icon.png';
const iconPath = path.join(wikiDir, 'images', iconName);

const PAGE_HEADER = `<p align="center">
  <img src="images/${iconName}" alt="Harness of AI logo" width="80" />
</p>

`;

const SIDEBAR_LOGO = `<p align="center">
  <img src="images/${iconName}" alt="Harness of AI logo" width="48" />
</p>

`;

if (!fs.existsSync(iconPath)) {
  console.error(`Missing ${iconPath} — copy packages/extension/resources/harness-icon.png first.`);
  process.exit(1);
}

for (const file of fs.readdirSync(wikiDir)) {
  if (!file.endsWith('.md')) continue;
  const full = path.join(wikiDir, file);
  let content = fs.readFileSync(full, 'utf8');

  if (file === '_Sidebar.md') {
    if (content.includes(iconName)) continue;
    content = content.replace(
      /^### Harness of AI Wiki\n/m,
      `### Harness of AI Wiki\n\n${SIDEBAR_LOGO}`,
    );
    fs.writeFileSync(full, content);
    console.log('Updated _Sidebar.md');
    continue;
  }

  if (content.includes(iconName)) continue;
  fs.writeFileSync(full, PAGE_HEADER + content);
  console.log(`Updated ${file}`);
}

console.log('[wiki-branding] Done.');
