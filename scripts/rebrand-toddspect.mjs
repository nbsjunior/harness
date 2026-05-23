#!/usr/bin/env node
/**
 * Rebrand Harness / ToddSpec → ToddSpect across source, docs, and config.
 * Run: node scripts/rebrand-toddspect.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'cli', 'vendor', '.wiki-publish']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.vsix', '.woff', '.woff2']);

const REPLACEMENTS = [
  ['ToddSpecSnapshotProvider', 'ToddSpectSnapshotProvider'],
  ['ToddSpecRelease', 'ToddSpectRelease'],
  ['buildToddSpecProcessEnv', 'buildToddSpectProcessEnv'],
  ['resolveToddSpecWorkspacePath', 'resolveToddSpectWorkspacePath'],
  ['loadToddSpecConfig', 'loadToddSpectConfig'],
  ['LoadedToddSpecConfig', 'LoadedToddSpectConfig'],
  ['buildToddSpecSystemGuidance', 'buildToddSpectSystemGuidance'],
  ['ToddSpecPluginManifest', 'ToddSpectPluginManifest'],
  ['ToddSpecPluginRegistry', 'ToddSpectPluginRegistry'],
  ['extractToddSpecContextBlocks', 'extractToddSpectContextBlocks'],
  ['sessionByToddSpecId', 'sessionByToddSpectId'],
  ['hasToddSpecDir', 'hasToddSpectDir'],
  ['loadHarnessConfig', 'loadToddSpectConfig'],
  ['LoadedHarnessConfig', 'LoadedToddSpectConfig'],
  ['HarnessPromptSettings', 'ToddSpectPromptSettings'],
  ['HarnessSettingsBridge', 'ToddSpectSettingsBridge'],
  ['HarnessConfigFile', 'ToddSpectConfigFile'],
  ['HarnessPluginManifest', 'ToddSpectPluginManifest'],
  ['HarnessPluginRegistry', 'ToddSpectPluginRegistry'],
  ['HarnessSnapshotProvider', 'ToddSpectSnapshotProvider'],
  ['buildHarnessProcessEnv', 'buildToddSpectProcessEnv'],
  ['buildHarnessSystemGuidance', 'buildToddSpectSystemGuidance'],
  ['resolveHarnessWorkspacePath', 'resolveToddSpectWorkspacePath'],
  ['extractHarnessContextBlocks', 'extractToddSpectContextBlocks'],
  ['hasHarnessDir', 'hasToddSpectDir'],
  ['harnessDir', 'toddspectDir'],
  ['harnessLog', 'toddspectLog'],
  ['harnessWarn', 'toddspectWarn'],
  ['sessionByHarnessId', 'sessionByToddSpectId'],
  ['TODDSPEC_', 'TODDSPECT_'],
  ['HARNESS_', 'TODDSPECT_'],
  ['@toddspec/cli', '@toddspect/cli'],
  ['@harness/cli', '@toddspect/cli'],
  ['toddspec-vscode', 'toddspect-vscode'],
  ['harness-vscode', 'toddspect-vscode'],
  ['toddspec-cli', 'toddspect-cli'],
  ['harness-cli', 'toddspect-cli'],
  ['toddspec-agent', 'toddspect-agent'],
  ['harness-agent', 'toddspect-agent'],
  ['ci-toddspec-agent', 'ci-toddspect-agent'],
  ['ci-harness-agent', 'ci-toddspect-agent'],
  ['toddspec-icon', 'toddspect-icon'],
  ['harness-icon', 'toddspect-icon'],
  ['toddspec-snapshot', 'toddspect-snapshot'],
  ['harness-snapshot', 'toddspect-snapshot'],
  ['toddspec.svg', 'toddspect.svg'],
  ['harness.svg', 'toddspect.svg'],
  ['.toddspec/', '.toddspect/'],
  ['.toddspec\\', '.toddspect\\'],
  ['`.toddspec', '`.toddspect'],
  ["'.toddspec", "'.toddspect"],
  ['.harness/', '.toddspect/'],
  ['.harness\\', '.toddspect\\'],
  ['`.harness', '`.toddspect'],
  ["'.harness", "'.toddspect"],
  ['.harness', '.toddspect'],
  ['why-toddspec.md', 'why-toddspect.md'],
  ['why-harness.md', 'why-toddspect.md'],
  ['Why-ToddSpec.md', 'Why-ToddSpect.md'],
  ['Why-Harness.md', 'Why-ToddSpect.md'],
  ['nbsjunior/ToddSpec', 'nbsjunior/todd'],
  ['nbsjunior/todd', 'nbsjunior/todd'],
  ['toddspec.', 'toddspect.'],
  ['harness.', 'toddspect.'],
  ['toddspec/', 'toddspect/'],
  ['harness/', 'toddspect/'],
  ['"toddspec"', '"toddspect"'],
  ['"harness"', '"toddspect"'],
  ["'toddspec'", "'toddspect'"],
  ["'harness'", "'toddspect'"],
  ['ToddSpec', 'ToddSpect'],
  ['Harness', 'ToddSpect'],
  ['toddspec', 'toddspect'],
  ['harness', 'toddspect'],
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

function replaceInFiles() {
  let n = 0;
  for (const f of walk(root)) {
    if (f.includes('rebrand-toddspect') || f.includes('rebrand-toddspec') || f.includes('fix-toddspec')) {
      continue;
    }
    let s = fs.readFileSync(f, 'utf8');
    const before = s;
    for (const [a, b] of REPLACEMENTS) s = s.split(a).join(b);
    if (s !== before) {
      fs.writeFileSync(f, s);
      n++;
    }
  }
  console.log(`[rebrand-toddspect] ${n} files updated`);
}

function renameIfExists(from, to) {
  if (fs.existsSync(from) && !fs.existsSync(to)) {
    fs.renameSync(from, to);
    console.log(`[rebrand-toddspect] rename ${path.relative(root, from)} → ${path.relative(root, to)}`);
  }
}

function mergeDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) mergeDir(s, d);
    else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
  fs.rmSync(src, { recursive: true, force: true });
  console.log(`[rebrand-toddspect] merged ${path.relative(root, src)} → ${path.relative(root, dest)}`);
}

function renameFiles() {
  const renames = [
    ['packages/extension/src/services/ToddSpecSnapshotProvider.ts', 'packages/extension/src/services/ToddSpectSnapshotProvider.ts'],
    ['packages/extension/src/services/HarnessSnapshotProvider.ts', null],
    ['packages/extension/resources/harness.svg', 'packages/extension/resources/toddspect.svg'],
    ['docs/why-toddspec.md', 'docs/why-toddspect.md'],
    ['docs/why-harness.md', 'docs/why-toddspect.md'],
    ['wiki/Why-ToddSpec.md', 'wiki/Why-ToddSpect.md'],
    ['wiki/Why-Harness.md', 'wiki/Why-ToddSpect.md'],
    ['.cursor/rules/harness-architecture.mdc', '.cursor/rules/toddspect-architecture.mdc'],
    ['.cursor/rules/harness-cli-conventions.mdc', '.cursor/rules/toddspect-cli-conventions.mdc'],
    ['.cursor/rules/harness-extension-conventions.mdc', '.cursor/rules/toddspect-extension-conventions.mdc'],
    ['.cursor/rules/toddspec-architecture.mdc', '.cursor/rules/toddspect-architecture.mdc'],
    ['.cursor/rules/toddspec-cli-conventions.mdc', '.cursor/rules/toddspect-cli-conventions.mdc'],
    ['.cursor/rules/toddspec-extension-conventions.mdc', '.cursor/rules/toddspect-extension-conventions.mdc'],
    ['.github/workflows/harness-agent.example.yml', '.github/workflows/toddspect-agent.example.yml'],
    ['.github/workflows/toddspec-agent.example.yml', '.github/workflows/toddspect-agent.example.yml'],
  ];
  for (const [from, to] of renames) {
    const fp = path.join(root, from);
    if (!fs.existsSync(fp)) continue;
    if (to === null) {
      fs.unlinkSync(fp);
      console.log(`[rebrand-toddspect] deleted ${from}`);
      continue;
    }
    renameIfExists(fp, path.join(root, to));
  }

  mergeDir(path.join(root, '.harness'), path.join(root, '.toddspect'));

  const iconSrc = path.join(root, 'docs/images/toddspect-icon.png');
  const iconDest = path.join(root, 'packages/extension/resources/toddspect-icon.png');
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, iconDest);
    console.log('[rebrand-toddspect] copied toddspect-icon.png → extension/resources/');
  }
}

replaceInFiles();
renameFiles();
