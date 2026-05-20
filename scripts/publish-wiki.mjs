#!/usr/bin/env node
/**
 * Publish wiki/ folder to GitHub Wiki (harness.wiki.git).
 * Usage: node scripts/publish-wiki.mjs
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const wikiSrc = path.join(root, 'wiki');
const wikiRemote = 'https://github.com/nbsjunior/harness.wiki.git';
const workDir = path.join(root, '.wiki-publish');

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? 'Harness',
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? 'harness@users.noreply.github.com',
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? 'Harness',
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? 'harness@users.noreply.github.com',
};

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, {
    stdio: 'inherit',
    cwd: opts.cwd ?? root,
    env: opts.env ?? gitEnv,
    ...opts,
  });
}

if (!fs.existsSync(wikiSrc)) {
  console.error('wiki/ folder not found');
  process.exit(1);
}

const files = fs.readdirSync(wikiSrc).filter((f) => f.endsWith('.md'));
if (files.length === 0) {
  console.error('No .md files in wiki/');
  process.exit(1);
}

if (fs.existsSync(workDir)) {
  fs.rmSync(workDir, { recursive: true, force: true });
}

fs.mkdirSync(workDir, { recursive: true });

let cloned = false;
try {
  run(`git clone ${wikiRemote} .`, { cwd: workDir });
  cloned = true;
} catch {
  console.log('[publish-wiki] Wiki repo empty or missing — initializing…');
  run('git init', { cwd: workDir });
  run(`git remote add origin ${wikiRemote}`, { cwd: workDir });
}

for (const file of files) {
  fs.copyFileSync(path.join(wikiSrc, file), path.join(workDir, file));
}

/** Copy wiki/images/ (manual screenshots, etc.) */
const wikiImages = path.join(wikiSrc, 'images');
if (fs.existsSync(wikiImages)) {
  function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  }
  copyDir(wikiImages, path.join(workDir, 'images'));
}

run('git add -A', { cwd: workDir });
try {
  run('git diff --cached --quiet', { cwd: workDir });
  console.log('[publish-wiki] No wiki changes to publish.');
} catch {
  run('git commit -m "docs(wiki): sync from main repo wiki/"', { cwd: workDir });
  try {
    run('git branch -M master', { cwd: workDir });
    run('git push -u origin master', { cwd: workDir });
    console.log('[publish-wiki] Published to GitHub Wiki.');
  } catch (err) {
    if (!cloned) {
      console.error(
        '[publish-wiki] Push failed. Enable Wikis in repo Settings, create Home page once in the UI, then re-run.',
      );
    }
    throw err;
  }
}
