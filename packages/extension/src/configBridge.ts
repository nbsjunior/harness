/**
 * @module configBridge
 * Builds `process.env` for CLI subprocesses so extension and CLI share connector settings.
 *
 * **Why:** VS Code stores secrets in `SecretStorage` and settings in `workspace.getConfiguration`;
 * the CLI only reads env vars and `TODDSPECT_SETTINGS_JSON`. This bridge is the single place
 * that translates extension state into what the daemon expects.
 *
 * **Copilot:** Always prefers live `gh auth token` over cached VS Code secret to avoid stale tokens.
 * Syncs secret when gh token changes.
 *
 * @see buildToddSpectProcessEnv
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import type { AgentSelectionId } from './types';
import { resolveToddSpectWorkspacePath } from './workspacePath.js';

function readCachedKiroCliPath(): string | undefined {
  const marker = path.join(os.homedir(), '.toddspect', 'tools', 'kiro-cli', 'kiro-cli-path.txt');
  if (!fs.existsSync(marker)) {
    return undefined;
  }
  const p = fs.readFileSync(marker, 'utf-8').trim();
  return p && fs.existsSync(p) ? p : undefined;
}

/**
 * Try `gh auth token`. Returns the token or null.
 * Classic PATs (ghp_) are rejected by the Copilot API, so we skip them.
 */
function getGhCliToken(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }
      const t = stdout.trim();
      resolve(t && !t.startsWith('ghp_') ? t : null);
    });
  });
}

/**
 * Builds process environment for CLI subprocesses so Extension and CLI
 * share the same connector endpoints and secrets.
 */
export async function buildToddSpectProcessEnv(
  context: vscode.ExtensionContext,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const toddspect = vscode.workspace.getConfiguration('toddspect');
  const workspacePath = resolveToddSpectWorkspacePath();

  const settingsBridge = {
    defaultAgent: toddspect.get<AgentSelectionId>('defaultAgent', 'auto'),
    promptOptimization: {
      enabled: toddspect.get<boolean>('promptOptimization.enabled', true),
      maxContextCharsPerFile: toddspect.get<number>('promptOptimization.maxContextCharsPerFile', 12_000),
      maxHistoryMessages: toddspect.get<number>('promptOptimization.maxHistoryMessages', 24),
    },
    spending: {
      budgetEnabled: toddspect.get<boolean>('spending.budgetEnabled', false),
      budgetTotalTokens: toddspect.get<number>('spending.budgetTotalTokens', 0),
      budgetWarnPercent: toddspect.get<number>('spending.budgetWarnPercent', 80),
      budgetTokensByAgent: toddspect.get<Record<string, number>>('spending.budgetTokensByAgent', {}),
    },
    connectors: {
      copilot: {
        endpoint: toddspect.get<string>('connectors.copilot.endpoint', 'https://api.githubcopilot.com'),
      },
      devin: {
        endpoint: toddspect.get<string>('connectors.devin.endpoint', 'https://api.devin.ai/v1'),
      },
      cursor: {
        endpoint: toddspect.get<string>(
          'connectors.cursor.endpoint',
          'https://api.cursor.com',
        ),
      },
      claude: {
        path: toddspect.get<string>('connectors.claude.path', 'claude'),
      },
      kiro: {
        cliPath: toddspect.get<string>('connectors.kiro.cliPath', 'kiro-cli'),
        endpoint: toddspect.get<string>('connectors.kiro.endpoint', ''),
        trustTools: toddspect.get<string>('connectors.kiro.trustTools', 'read,grep,write'),
        trustAllTools: toddspect.get<boolean>('connectors.kiro.trustAllTools', false),
        mode: toddspect.get<'cli' | 'rest'>('connectors.kiro.mode', 'cli'),
      },
    },
    aidlc: {
      autoInstall: toddspect.get<boolean>('aidlc.autoInstall', true),
    },
    cursor: {
      agentExecution: toddspect.get<'auto' | 'local' | 'cloud'>('cursor.agentExecution', 'auto'),
    },
    specsDirectory: toddspect.get<string>('specsDirectory', '.toddspect/specs'),
  };

  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    TODDSPECT_IPC: baseEnv['TODDSPECT_IPC'] ?? '1',
    TODDSPECT_WORKSPACE:
      workspacePath ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
      baseEnv['TODDSPECT_WORKSPACE'] ??
      '',
    TODDSPECT_SETTINGS_JSON: JSON.stringify(settingsBridge),
  };

  const secretMap: Array<{ key: string; envVars: string[] }> = [
    { key: 'toddspect.connectors.copilot.token', envVars: ['GH_TOKEN', 'COPILOT_GITHUB_TOKEN'] },
    { key: 'toddspect.connectors.claude.apiKey', envVars: ['ANTHROPIC_API_KEY'] },
    { key: 'toddspect.connectors.devin.apiKey', envVars: ['DEVIN_API_KEY'] },
    { key: 'toddspect.connectors.cursor.apiKey', envVars: ['CURSOR_API_KEY'] },
    { key: 'toddspect.connectors.kiro.apiKey', envVars: ['KIRO_API_KEY'] },
  ];

  // For the Copilot token: always try `gh auth token` first (freshest source),
  // then fall back to VS Code secrets. This avoids using a stale cached token.
  const liveGhToken = await getGhCliToken();
  if (liveGhToken) {
    env['GH_TOKEN'] = liveGhToken;
    // Keep secret in sync with the live token
    const stored = await context.secrets.get('toddspect.connectors.copilot.token');
    if (stored !== liveGhToken) {
      void context.secrets.store('toddspect.connectors.copilot.token', liveGhToken);
    }
  }

  // For all other secrets (claude, devin, cursor, kiro) — read from VS Code secrets
  for (const { key, envVars } of secretMap) {
    if (key === 'toddspect.connectors.copilot.token') {
      // Copilot handled above via `gh auth token`; only use secret as fallback
      if (!env['GH_TOKEN'] && !env['COPILOT_GITHUB_TOKEN']) {
        const value = await context.secrets.get(key);
        if (value) {
          env['GH_TOKEN'] = value;
        }
      }
      continue;
    }
    const value = await context.secrets.get(key);
    if (!value) {
      continue;
    }
    for (const envVar of envVars) {
      if (!env[envVar]) {
        env[envVar] = value;
      }
    }
  }

  // Claude path from settings (non-secret)
  const claudePath = toddspect.get<string>('connectors.claude.path', 'claude');
  if (!env['CLAUDE_PATH']) {
    env['CLAUDE_PATH'] = claudePath;
  }

  const kiroCliPath =
    readCachedKiroCliPath() ??
    toddspect.get<string>('connectors.kiro.cliPath', 'kiro-cli');
  if (!env['KIRO_CLI_PATH']) {
    env['KIRO_CLI_PATH'] = kiroCliPath;
  }

  return env;
}
