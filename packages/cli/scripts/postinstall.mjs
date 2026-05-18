#!/usr/bin/env node
/**
 * After npm install of @harness/cli: cache Kiro CLI + verify AI-DLC vendor (no workspace init).
 */
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(__dirname, '..', 'dist', 'index.js');

if (!existsSync(cli)) {
  process.exit(0);
}

const child = spawn(process.execPath, [cli, 'setup', '--skip-init', '-q'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', () => process.exit(0));
child.on('error', () => process.exit(0));
