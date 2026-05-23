import { installAidlcRules } from '../aidlc/install.js';
import { getAidlcStatus } from '../aidlc/status.js';
import { ensureKiroCli } from '../kiro/bootstrap.js';
import { initCommand } from './init.js';
import { ensureDefaultSpecs } from '../specs/defaultSpecs.js';
import { toddspectLog, toddspectWarn } from '../log.js';
import * as fs from 'fs';
import * as path from 'path';

export interface SetupOptions {
  dir?: string;
  skipInit?: boolean;
  skipKiro?: boolean;
  skipAidlc?: boolean;
  quiet?: boolean;
}

/**
 * One-shot bootstrap: Todd workspace + Kiro CLI + AI-DLC rules.
 * Called on `toddspect setup`, extension activate, and optional postinstall.
 */
export async function setupCommand(options: SetupOptions = {}): Promise<number> {
  const dir = path.resolve(options.dir ?? process.env['TODDSPECT_WORKSPACE'] ?? process.cwd());
  const log = (msg: string) => {
    if (!options.quiet) {
      toddspectLog(msg);
    }
  };

  if (!options.skipInit && !fs.existsSync(path.join(dir, '.toddspect'))) {
    log('\n→ Initializing Todd workspace...');
    await initCommand(dir);
  } else if (!options.skipInit) {
    log('\n→ Todd workspace already present.');
    const specsDir = path.join(dir, '.toddspect', 'specs');
    const added = ensureDefaultSpecs(specsDir);
    for (const rel of added) {
      log(`  created  .toddspect/${rel}`);
    }
  }

  if (!options.skipKiro) {
    log('\n→ Ensuring Kiro CLI...');
    try {
      const kiro = await ensureKiroCli({ allowDownload: true });
      log(`  Kiro CLI: ${kiro.cliPath} (${kiro.source}${kiro.version ? `, v${kiro.version}` : ''})`);
    } catch (err) {
      toddspectWarn(`  warn: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!options.skipAidlc) {
    log('\n→ Ensuring AI-DLC steering rules...');
    try {
      const aidlc = await installAidlcRules(dir);
      if (!options.quiet) {
        for (const line of aidlc.created) {
          log(`  created  ${line}`);
        }
        for (const line of aidlc.skipped) {
          log(`  skipped  ${line}`);
        }
      }
    } catch (err) {
      toddspectWarn(`  warn: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const status = getAidlcStatus(dir);
  log('\nSetup complete.');
  log(`  AI-DLC: ${status.installed ? 'installed' : 'missing'}`);
  log('  Next: set KIRO_API_KEY, then chat with agent Kiro using "Using AI-DLC, ..."');
  log('  Docs: https://github.com/awslabs/aidlc-workflows\n');

  return 0;
}
