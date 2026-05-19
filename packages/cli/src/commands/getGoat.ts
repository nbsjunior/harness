import { loadAgentConfig } from '../config.js';
import { probeCursorApi } from '../connectors/cursorCloud.js';
import { checkAllAgents } from '../router/agentReadiness.js';
import { getAidlcStatus } from '../aidlc/status.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * `harness check getGoat` — diagnose Harness setup: config, agents, AI-DLC.
 * All output goes to stderr except JSON mode.
 */
export async function getGoatCommand(options: {
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

  process.stderr.write('\nHarness getGoat\n');
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

  const cursorCfg = config.cursor;
  if (cursorCfg.apiKey) {
    const probe = await probeCursorApi(cursorCfg.apiKey, cursorCfg.endpoint);
    if (probe.ok) {
      const who = probe.userEmail ?? probe.apiKeyName ?? 'authenticated';
      process.stderr.write(
        `\n  Cursor API live check: OK (${who}) @ ${probe.endpoint}\n`,
      );
    } else {
      process.stderr.write(`\n  Cursor API live check: FAILED — ${probe.error}\n`);
      process.stderr.write(
        '    Fix: key at https://cursor.com/dashboard/integrations, endpoint https://api.cursor.com\n',
      );
    }
  } else {
    process.stderr.write(
      '\n  Cursor: no API key — create one at https://cursor.com/dashboard/integrations\n' +
        '    VS Code: Harness → Configuration → Cursor → paste key → Test Connection → Reload\n',
    );
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
