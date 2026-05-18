import { loadAgentConfig } from '../config.js';
import { checkAllAgents } from '../router/agentReadiness.js';
import { getAidlcStatus } from '../aidlc/status.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Diagnose Harness setup: config sources, bundled paths, agent readiness.
 * All output goes to stderr except JSON mode.
 */
export async function doctorCommand(options: {
  specsDir?: string;
  json?: boolean;
}): Promise<number> {
  const config = loadAgentConfig(options.specsDir);
  const readiness = checkAllAgents(config);

  const workspace = process.env['HARNESS_WORKSPACE'] ?? process.cwd();
  const harnessDir = path.join(workspace, '.harness');
  const hasHarnessDir = fs.existsSync(harnessDir);
  const aidlc = getAidlcStatus(workspace);

  const envHints = {
    GH_TOKEN: !!process.env['GH_TOKEN'],
    COPILOT_GITHUB_TOKEN: !!process.env['COPILOT_GITHUB_TOKEN'],
    GITHUB_TOKEN: !!process.env['GITHUB_TOKEN'],
    ANTHROPIC_API_KEY: !!process.env['ANTHROPIC_API_KEY'],
    DEVIN_API_KEY: !!process.env['DEVIN_API_KEY'],
    CURSOR_API_KEY: !!process.env['CURSOR_API_KEY'],
    KIRO_API_KEY: !!process.env['KIRO_API_KEY'],
    HARNESS_SETTINGS_JSON: !!process.env['HARNESS_SETTINGS_JSON'],
  };

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          workspace,
          hasHarnessDir,
          aidlc: {
            installed: aidlc.installed,
            version: aidlc.bundledVersion,
            aidlcDocs: aidlc.aidlcDocsPresent,
          },
          envHints,
          agents: readiness,
          readyCount: readiness.filter((r) => r.ready).length,
        },
        null,
        2,
      ) + '\n',
    );
    return readiness.some((r) => r.ready) ? 0 : 1;
  }

  process.stderr.write('\nHarness Doctor\n');
  process.stderr.write('═'.repeat(50) + '\n\n');
  process.stderr.write(`Workspace: ${workspace}\n`);
  process.stderr.write(`.harness/: ${hasHarnessDir ? 'found' : 'missing (run: harness init)'}\n`);
  process.stderr.write(
    `Config bridge (VS Code): ${envHints.HARNESS_SETTINGS_JSON ? 'yes' : 'no (CLI-only mode)'}\n`,
  );
  process.stderr.write(
    `AI-DLC (Kiro steering): ${aidlc.installed ? `installed (v${aidlc.bundledVersion})` : 'not installed (run: harness aidlc install)'}\n`,
  );
  if (aidlc.installed) {
    process.stderr.write(`  aidlc-docs/: ${aidlc.aidlcDocsPresent ? 'found' : 'will be created on first workflow'}\n`);
  }
  process.stderr.write('\nAgents:\n');
  for (const r of readiness) {
    const icon = r.ready ? '✓' : '✗';
    process.stderr.write(`  ${icon} ${r.label.padEnd(18)} ${r.hint}\n`);
  }

  const ready = readiness.filter((r) => r.ready);
  process.stderr.write(`\n${ready.length}/5 agent(s) ready.\n`);

  if (!hasHarnessDir) {
    process.stderr.write('\nTip: run `harness init` in your project root.\n');
  }
  if (!ready.some((r) => r.agent === 'copilot')) {
    process.stderr.write(
      '\nQuickest start (Copilot): `gh auth login` then `export GH_TOKEN=$(gh auth token)`\n',
    );
  }

  process.stderr.write('\nModes:\n');
  process.stderr.write('  • VS Code Extension — sidebar Chat (spawns CLI daemon automatically)\n');
  process.stderr.write('  • CLI — `harness agent:run --agent copilot --prompt "..."`\n\n');

  return ready.length > 0 ? 0 : 1;
}
