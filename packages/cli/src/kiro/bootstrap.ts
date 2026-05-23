import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execa } from 'execa';
import { probeKiroCli } from '../connectors/kiroCli.js';
import {
  getKiroToolsRoot,
  readCachedKiroCliPath,
  resolveBundledKiroCliPath,
  writeCachedKiroCliPath,
} from './paths.js';

const KIRO_MANIFEST_URL = 'https://prod.download.cli.kiro.dev/stable/latest/manifest.json';
const KIRO_DOWNLOAD_BASE = 'https://prod.download.cli.kiro.dev/stable';

export interface KiroBootstrapResult {
  cliPath: string;
  source: 'path' | 'bundled' | 'cache' | 'installed';
  version?: string;
}

interface KiroPackage {
  os: string;
  architecture: string;
  variant?: string;
  fileType: string;
  download: string;
  sha256: string;
  size: number;
  cliPath?: string;
}

interface KiroManifest {
  version: string;
  packages: KiroPackage[];
}

function findBinaryRecursive(dir: string, name: string, depth = 0): string | null {
  if (depth > 6) {
    return null;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
    if (entry.isDirectory()) {
      const found = findBinaryRecursive(full, name, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

async function fetchManifest(): Promise<KiroManifest> {
  const res = await fetch(KIRO_MANIFEST_URL);
  if (!res.ok) {
    throw new Error(`Kiro manifest HTTP ${res.status}`);
  }
  return (await res.json()) as KiroManifest;
}

function platformOs(): string {
  if (process.platform === 'win32') {
    return 'windows';
  }
  if (process.platform === 'darwin') {
    return 'macos';
  }
  return 'linux';
}

function pickPackage(manifest: KiroManifest): KiroPackage | null {
  const os = platformOs();
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';

  const headlessZip = manifest.packages.find(
    (p) =>
      p.os === os &&
      p.architecture === arch &&
      p.variant === 'headless' &&
      p.fileType === 'zip',
  );
  if (headlessZip) {
    return headlessZip;
  }

  if (os === 'windows') {
    const msi = manifest.packages.find(
      (p) => p.os === 'windows' && p.architecture === 'x86_64' && p.fileType === 'msi',
    );
    if (msi) {
      return msi;
    }
  }

  return null;
}

async function verifySha256(filePath: string, expected: string): Promise<void> {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  const actual = hash.digest('hex');
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('Kiro download checksum mismatch');
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    await execa(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { reject: true },
    );
  } else {
    await execa('unzip', ['-q', zipPath, '-d', destDir], { reject: true });
  }
}

async function installFromZip(pkg: KiroPackage, version: string): Promise<string> {
  const toolsRoot = getKiroToolsRoot();
  const installDir = path.join(toolsRoot, version);
  const zipPath = path.join(toolsRoot, `download-${version}.zip`);
  const url = `${KIRO_DOWNLOAD_BASE}/${pkg.download}`;

  if (!fs.existsSync(installDir)) {
    fs.mkdirSync(toolsRoot, { recursive: true });
    process.stderr.write(`[todd] Downloading Kiro CLI ${version} (~${Math.round(pkg.size / 1048576)} MB)...\n`);
    await downloadFile(url, zipPath);
    await verifySha256(zipPath, pkg.sha256);
    await extractZip(zipPath, installDir);
    fs.rmSync(zipPath, { force: true });
  }

  const binName = process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli';
  const binary = findBinaryRecursive(installDir, binName);
  if (!binary) {
    throw new Error(`kiro-cli binary not found under ${installDir}`);
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(binary, 0o755);
  }
  return binary;
}

async function installFromMsi(pkg: KiroPackage, version: string): Promise<string> {
  const toolsRoot = getKiroToolsRoot();
  const installDir = path.join(toolsRoot, version);
  const msiPath = path.join(toolsRoot, `download-${version}.msi`);
  const url = `${KIRO_DOWNLOAD_BASE}/${pkg.download}`;

  fs.mkdirSync(toolsRoot, { recursive: true });
  if (!fs.existsSync(msiPath)) {
    process.stderr.write(`[todd] Downloading Kiro CLI ${version} (~${Math.round(pkg.size / 1048576)} MB)...\n`);
    await downloadFile(url, msiPath);
    await verifySha256(msiPath, pkg.sha256);
  }

  if (!fs.existsSync(installDir)) {
    fs.mkdirSync(installDir, { recursive: true });
    await execa(
      'msiexec',
      ['/a', msiPath, `TARGETDIR=${installDir}`, '/qn'],
      { reject: true },
    );
  }

  const binary = findBinaryRecursive(installDir, 'kiro-cli.exe');
  if (!binary) {
    throw new Error(`kiro-cli.exe not found after MSI extract in ${installDir}`);
  }
  return binary;
}

async function installViaOfficialScript(): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      await execa(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "irm 'https://cli.kiro.dev/install.ps1' | iex"],
        { reject: false, timeout: 300_000 },
      );
    } else {
      await execa('bash', ['-c', 'curl -fsSL https://cli.kiro.dev/install | bash'], {
        reject: false,
        timeout: 300_000,
      });
    }
    const onPath = process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli';
    if (await probeKiroCli(onPath)) {
      return onPath;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Ensure Kiro CLI is available. Installs to ~/.toddspect/tools/kiro-cli when needed.
 */
export async function ensureKiroCli(options: {
  allowDownload?: boolean;
} = {}): Promise<KiroBootstrapResult> {
  const allowDownload = options.allowDownload ?? true;
  const binName = process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli';

  const cached = readCachedKiroCliPath();
  if (cached && (await probeKiroCli(cached))) {
    return { cliPath: cached, source: 'cache' };
  }

  const bundled = resolveBundledKiroCliPath();
  if (bundled && (await probeKiroCli(bundled))) {
    writeCachedKiroCliPath(bundled);
    return { cliPath: bundled, source: 'bundled' };
  }

  if (await probeKiroCli(binName)) {
    writeCachedKiroCliPath(binName);
    return { cliPath: binName, source: 'path' };
  }

  if (!allowDownload) {
    throw new Error(
      'Kiro CLI not found. Run `todd setup` or install from https://kiro.dev/docs/cli/installation',
    );
  }

  try {
    const manifest = await fetchManifest();
    const pkg = pickPackage(manifest);
    if (!pkg) {
      throw new Error('No compatible Kiro CLI package in manifest');
    }

    let cliPath: string;
    if (pkg.fileType === 'zip') {
      cliPath = await installFromZip(pkg, manifest.version);
    } else if (pkg.fileType === 'msi') {
      cliPath = await installFromMsi(pkg, manifest.version);
    } else {
      throw new Error(`Unsupported Kiro package type: ${pkg.fileType}`);
    }

    writeCachedKiroCliPath(cliPath);
    process.stderr.write(`[todd] Kiro CLI ready: ${cliPath}\n`);
    return { cliPath, source: 'installed', version: manifest.version };
  } catch (err) {
    process.stderr.write(
      `[todd] Kiro auto-install failed: ${(err as Error).message}. Trying official installer...\n`,
    );
    const fromScript = await installViaOfficialScript();
    if (fromScript) {
      writeCachedKiroCliPath(fromScript);
      return { cliPath: fromScript, source: 'installed' };
    }
    throw new Error(
      `Could not install Kiro CLI: ${(err as Error).message}. Install manually: https://kiro.dev/docs/cli/installation`,
    );
  }
}

/** Synchronous best-effort path (before async bootstrap). */
export function resolveKiroCliPathSync(): string {
  return (
    readCachedKiroCliPath() ??
    resolveBundledKiroCliPath() ??
    (process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli')
  );
}
