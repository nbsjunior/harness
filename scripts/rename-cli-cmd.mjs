#!/usr/bin/env node
/**
 * Rename CLI command: toddspect → todd
 * Touches: package.json bin, index.ts .name(), comments, all user-facing CLI references in source + docs.
 * Preserves: .toddspect/ paths, TODDSPECT_* env vars, toddspect.* VS Code settings, npm package name.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SKIP = new Set(['node_modules', 'dist', '.git', 'vendor', '.wiki-publish']);

function walkFiles(dir, exts) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) out.push(...walkFiles(abs, exts));
    else if (exts.some(e => abs.endsWith(e))) out.push(abs);
  }
  return out;
}

// Patterns that must NOT be renamed (identifiers, paths, settings, env vars)
const PROTECT = [
  /\.toddspect\//g,          // workspace folder path
  /\.toddspect\\/g,
  /TODDSPECT_/g,             // env vars
  /toddspect\.\w/g,          // VS Code settings: toddspect.xxx
  /@toddspect\//g,           // npm scope
  /toddspect-vscode/g,       // VSIX package name
  /toddspect-icon/g,         // icon resource
  /toddspect\.svg/g,
  /toddspect-snapshot/g,
  /toddspect-cli\b/g,        // internal label [toddspect-cli]
  /loadToddSpectConfig/g,
  /buildToddSpectSystemGuidance/g,
  /mergeToddSpectSystemGuidance/g,
  /LoadedToddSpectConfig/g,
  /ToddSpectConfigFile/g,
  /ToddSpectSettingsBridge/g,
  /ToddSpectPromptSettings/g,
  /ToddSpectPluginManifest/g,
  /ToddSpectPluginRegistry/g,
  /loadPluginRegistry/g,
  /sessionByToddSpectId/g,
  /extractToddSpectContextBlocks/g,
  /hasToddSpectDir\b/g,
  /ToddSpectRelease/g,       // local install folder name
  /package:vsix:release/g,
];

// Replace `todd` as the CLI command token.
// We match: `todd`, "toddspect", toddspect (as a word boundary command reference)
// but only when NOT preceded by characters that indicate it's part of an identifier above.
function rebrand(text) {
  // Protect all the identifiers we must NOT touch
  const protectMap = new Map();
  let idx = 0;
  let s = text;

  // Replace protected patterns with placeholders
  for (const re of PROTECT) {
    s = s.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), m => {
      const key = `\x00PH${idx++}\x00`;
      protectMap.set(key, m);
      return key;
    });
  }

  // Now rename the CLI command token in various contexts:
  // backtick command refs: `todd ...`
  s = s.replace(/`toddspect(\s)/g, '`todd$1');
  s = s.replace(/`todd`/g, '`todd`');
  // inline code in markdown: `todd`
  // shell code blocks: starts-of-line   toddspect ...
  s = s.replace(/^(toddspect)(\s)/gm, 'todd$2');
  s = s.replace(/^(toddspect)$/gm, 'todd');
  // comments: // todd init [dir]
  s = s.replace(/\/\/ toddspect /g, '// todd ');
  // .name('todd')
  s = s.replace(/\.name\('toddspect'\)/g, ".name('todd')");
  // [toddspect-cli] IPC log tag → [todd-cli]
  s = s.replace(/\[toddspect-cli\]/g, '[todd-cli]');
  // process.stderr.write(`[todd  →  [todd
  s = s.replace(/\[todd\b/g, '[todd');
  // description strings and prose: "run todd setup", "toddspect check getGoat", etc.
  s = s.replace(/run todd /g, 'run todd ');
  s = s.replace(/run `todd /g, 'run `todd ');  // already handled above, keep idempotent
  // option strings: --skip-init, 'Do not run todd init'
  s = s.replace(/(Do not run )toddspect /g, '$1todd ');
  // prose in strings/comments ending without backtick
  s = s.replace(/(standalone \()toddspect /g, '$1todd ');
  s = s.replace(/(called on `)toddspect /gi, '$1todd ');
  // description() in CLI setup
  s = s.replace(/'Todd of AIDLC — Meta-Agent Orchestrator CLI'/g, "'Todd of AIDLC — Meta-Agent Orchestrator CLI'");
  // CLI package description
  s = s.replace(/"Todd of AIDLC CLI — local orchestrator for AI agent calls and SDD spec management"]*"/g, '"Todd of AIDLC CLI — local orchestrator for AI agent calls and SDD spec management"');

  // Restore protected patterns
  for (const [key, val] of protectMap) {
    s = s.split(key).join(val);
  }
  return s;
}

const files = walkFiles(root, ['.ts', '.mjs', '.json', '.md', '.yaml', '.yml', '.html']);
let updated = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = rebrand(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    updated++;
    console.log(' ', path.relative(root, file));
  }
}

// Also patch the bin entry in packages/cli/package.json: "toddspect" → "todd"
const cliPkg = path.join(root, 'packages/cli/package.json');
const pkg = JSON.parse(fs.readFileSync(cliPkg, 'utf8'));
if (pkg.bin?.toddspect) {
  pkg.bin = { todd: pkg.bin.toddspect };
  pkg.description = 'Todd of AIDLC CLI — local orchestrator for AI agent calls and SDD spec management';
  fs.writeFileSync(cliPkg, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('  packages/cli/package.json  (bin: toddspect → todd)');
  updated++;
}

console.log(`\n[rename-cli-cmd] ${updated} files updated`);
