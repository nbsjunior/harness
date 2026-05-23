import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** User-wide Kiro CLI cache (shared by ToddSpect CLI and Extension). */
export function getKiroToolsRoot(): string {
  return path.join(os.homedir(), '.toddspect', 'tools', 'kiro-cli');
}

export function getKiroPathMarkerFile(): string {
  return path.join(getKiroToolsRoot(), 'kiro-cli-path.txt');
}

export function readCachedKiroCliPath(): string | null {
  const marker = getKiroPathMarkerFile();
  if (!fs.existsSync(marker)) {
    return null;
  }
  const p = fs.readFileSync(marker, 'utf-8').trim();
  return p && fs.existsSync(p) ? p : null;
}

export function writeCachedKiroCliPath(cliPath: string): void {
  const root = getKiroToolsRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(getKiroPathMarkerFile(), cliPath, 'utf-8');
}

/** Bundled with ToddSpect CLI / .vsix (packages/cli/vendor/kiro-cli/...). */
export function resolveBundledKiroCliPath(): string | null {
  const platform = `${process.platform}-${process.arch}`;
  const binName = process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli';

  const candidates = [
    path.join(__dirname, '..', 'vendor', 'kiro-cli', platform, binName),
    path.join(__dirname, '..', '..', 'vendor', 'kiro-cli', platform, binName),
    path.join(__dirname, 'vendor', 'kiro-cli', platform, binName),
    path.join(__dirname, '..', 'vendor', 'kiro-cli', binName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
