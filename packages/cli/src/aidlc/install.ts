import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import {
  AIDLC_DOCS_DIR,
  AIDLC_RELEASE_ZIP_URL,
  AIDLC_RULES_VERSION,
  KIRO_RULE_DETAILS,
  KIRO_STEERING_RULES,
} from './constants.js';
import { getAidlcPaths } from './paths.js';
import { getAidlcStatus } from './status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AidlcInstallResult {
  installed: boolean;
  created: string[];
  skipped: string[];
  version: string;
  source: 'bundled' | 'download';
}

/**
 * Resolve bundled AI-DLC rules shipped with the CLI (also copied into the .vsix).
 */
export function resolveBundledAidlcVendorDir(): string | null {
  const candidates = [
    path.join(__dirname, '..', 'vendor', 'aidlc-rules'),
    path.join(__dirname, '..', '..', 'vendor', 'aidlc-rules'),
    path.join(__dirname, 'vendor', 'aidlc-rules'),
  ];

  for (const dir of candidates) {
    const core = path.join(dir, KIRO_STEERING_RULES, 'core-workflow.md');
    if (fs.existsSync(core)) {
      return dir;
    }
  }
  return null;
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function downloadAndExtractAidlcRules(destVendorDir: string): Promise<void> {
  const tmpRoot = fs.mkdtempSync(path.join(path.dirname(destVendorDir), 'aidlc-dl-'));
  const zipPath = path.join(tmpRoot, `ai-dlc-rules-v${AIDLC_RULES_VERSION}.zip`);
  const extractDir = path.join(tmpRoot, 'extracted');

  try {
    const res = await fetch(AIDLC_RELEASE_ZIP_URL);
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status} ${AIDLC_RELEASE_ZIP_URL}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(zipPath, buf);

    fs.mkdirSync(extractDir, { recursive: true });
    if (process.platform === 'win32') {
      await execa(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
        ],
        { reject: true },
      );
    } else {
      await execa('unzip', ['-q', zipPath, '-d', extractDir], { reject: true });
    }

    const rulesRoot = path.join(extractDir, 'aidlc-rules');
    if (!fs.existsSync(rulesRoot)) {
      throw new Error('Unexpected zip layout: aidlc-rules/ not found');
    }

    fs.mkdirSync(destVendorDir, { recursive: true });
    copyDirRecursive(path.join(rulesRoot, KIRO_STEERING_RULES), path.join(destVendorDir, KIRO_STEERING_RULES));
    copyDirRecursive(
      path.join(rulesRoot, KIRO_RULE_DETAILS),
      path.join(destVendorDir, KIRO_RULE_DETAILS),
    );
    if (fs.existsSync(path.join(rulesRoot, 'VERSION'))) {
      fs.copyFileSync(path.join(rulesRoot, 'VERSION'), path.join(destVendorDir, 'VERSION'));
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function resolveAidlcSourceDir(): Promise<{ dir: string; source: 'bundled' | 'download' }> {
  const bundled = resolveBundledAidlcVendorDir();
  if (bundled) {
    return { dir: bundled, source: 'bundled' };
  }

  const cacheDir = path.join(
    process.env['TODDSPECT_WORKSPACE'] ?? process.cwd(),
    '.toddspect',
    'cache',
    `aidlc-rules-v${AIDLC_RULES_VERSION}`,
  );
  if (!fs.existsSync(path.join(cacheDir, KIRO_STEERING_RULES, 'core-workflow.md'))) {
    await downloadAndExtractAidlcRules(cacheDir);
  }
  return { dir: cacheDir, source: 'download' };
}

/**
 * Install AI-DLC steering rules into the workspace (Kiro layout).
 * @see https://github.com/awslabs/aidlc-workflows
 */
export async function installAidlcRules(
  workspaceRoot: string,
  options: { force?: boolean } = {},
): Promise<AidlcInstallResult> {
  const paths = getAidlcPaths(workspaceRoot);
  const status = getAidlcStatus(workspaceRoot);
  const created: string[] = [];
  const skipped: string[] = [];

  if (status.installed && !options.force) {
    skipped.push('.kiro/steering/aws-aidlc-rules (already installed)');
    if (!status.aidlcDocsPresent) {
      fs.mkdirSync(paths.aidlcDocsDir, { recursive: true });
      created.push(`${AIDLC_DOCS_DIR}/`);
    }
    return {
      installed: true,
      created,
      skipped,
      version: AIDLC_RULES_VERSION,
      source: 'bundled',
    };
  }

  const { dir: sourceDir, source } = await resolveAidlcSourceDir();

  fs.mkdirSync(paths.steeringDir, { recursive: true });
  copyDirRecursive(path.join(sourceDir, KIRO_STEERING_RULES), paths.steeringRulesDir);
  created.push(`.kiro/steering/${KIRO_STEERING_RULES}/`);

  copyDirRecursive(path.join(sourceDir, KIRO_RULE_DETAILS), paths.ruleDetailsDir);
  created.push(`.kiro/${KIRO_RULE_DETAILS}/`);

  fs.mkdirSync(paths.aidlcDocsDir, { recursive: true });
  created.push(`${paths.aidlcDocsDir.replace(workspaceRoot, '').replace(/^[/\\]/, '')}/`);

  return {
    installed: true,
    created,
    skipped,
    version: AIDLC_RULES_VERSION,
    source,
  };
}

export async function ensureAidlcInstalled(
  workspaceRoot: string,
  autoInstall: boolean,
): Promise<boolean> {
  const status = getAidlcStatus(workspaceRoot);
  if (status.installed) {
    return true;
  }
  if (!autoInstall) {
    return false;
  }
  await installAidlcRules(workspaceRoot);
  return getAidlcStatus(workspaceRoot).installed;
}
