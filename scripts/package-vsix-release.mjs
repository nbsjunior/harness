#!/usr/bin/env node
/**
 * Build VSIX and copy to %LOCALAPPDATA%/ToddSpectRelease (avoids OneDrive sync corruption).
 * Prints SHA256 and install path for manual VSIX install.
 */
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

run('npm', ['run', 'package:vsix']);

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'packages', 'extension', 'package.json'), 'utf-8'),
);
const vsixName = `toddspect-vscode-${pkg.version}.vsix`;
const srcActual = path.join(root, 'packages', 'extension', vsixName);

if (!fs.existsSync(srcActual)) {
  console.error(`[package-vsix-release] Missing ${srcActual}`);
  process.exit(1);
}

const outDir =
  process.env.TODDSPECT_VSIX_OUT ??
  path.join(process.env.LOCALAPPDATA ?? process.env.TEMP ?? '.', 'ToddSpectRelease');
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, vsixName);
fs.copyFileSync(srcActual, dest);

const buf = fs.readFileSync(dest);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
const shaPath = `${dest}.sha256`;
fs.writeFileSync(shaPath, `${sha}  ${vsixName}\n`, 'utf-8');

console.log('\n[package-vsix-release] OK');
console.log(`  VSIX: ${dest}`);
console.log(`  Size: ${buf.length} bytes (expect ~19748096 for v0.1.9)`);
console.log(`  SHA256: ${sha}`);
console.log(`  Checksum file: ${shaPath}`);
console.log('\nInstall: Extensions → … → Install from VSIX → select the path above.');
console.log('Do not install from OneDrive until the file shows full size on disk.\n');
