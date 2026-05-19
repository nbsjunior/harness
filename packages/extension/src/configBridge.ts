/**
 * @module configBridge
 * Builds `process.env` for CLI subprocesses so extension and CLI share connector settings.
 *
 * **Why:** VS Code stores secrets in `SecretStorage` and settings in `workspace.getConfiguration`;
 * the CLI only reads env vars and `HARNESS_SETTINGS_JSON`. This bridge is the single place
 * that translates extension state into what the daemon expects.
 *
 * **Copilot:** Always prefers live `gh auth token` over cached VS Code secret to avoid stale tokens.
 * Syncs secret when gh token changes.
 *
 * @see buildHarnessProcessEnv
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import type { AgentId, AgentSelectionId } from './types';

function readCachedKiroCliPath(): string | undefined {
  const marker = path.join(os.homedir(), '.harness', 'tools', 'kiro-cli', 'kiro-cli-path.txt');
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
export async function buildHarnessProcessEnv(
  context: vscode.ExtensionContext,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const harness = vscode.workspace.getConfiguration('harness');
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  const settingsBridge = {
    defaultAgent: harness.get<AgentSelectionId>('defaultAgent', 'auto'),
    connectors: {
      copilot: {
        endpoint: harness.get<string>('connectors.copilot.endpoint', 'https://api.githubcopilot.com'),
      },
      devin: {
        endpoint: harness.get<string>('connectors.devin.endpoint', 'https://api.devin.ai/v1'),
      },
      cursor: {
        endpoint: harness.get<string>(
          'connectors.cursor.endpoint',
          'https://api.cursor.com',
        ),
      },
      claude: {
        path: harness.get<string>('connectors.claude.path', 'claude'),
      },
      kiro: {
        cliPath: harness.get<string>('connectors.kiro.cliPath', 'kiro-cli'),
        endpoint: harness.get<string>('connectors.kiro.endpoint', ''),
        trustTools: harness.get<string>('connectors.kiro.trustTools', 'read,grep,write'),
        trustAllTools: harness.get<boolean>('connectors.kiro.trustAllTools', false),
        mode: harness.get<'cli' | 'rest'>('connectors.kiro.mode', 'cli'),
      },
    },
    aidlc: {
      autoInstall: harness.get<boolean>('aidlc.autoInstall', true),
    },
    specsDirectory: harness.get<string>('specsDirectory', '.harness/specs'),
  };

  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    HARNESS_IPC: baseEnv['HARNESS_IPC'] ?? '1',
    HARNESS_WORKSPACE: workspaceFolder?.uri.fsPath ?? baseEnv['HARNESS_WORKSPACE'] ?? '',
    HARNESS_SETTINGS_JSON: JSON.stringify(settingsBridge),
  };

  const secretMap: Array<{ key: string; envVars: string[] }> = [
    { key: 'harness.connectors.copilot.token', envVars: ['GH_TOKEN', 'COPILOT_GITHUB_TOKEN'] },
    { key: 'harness.connectors.claude.apiKey', envVars: ['ANTHROPIC_API_KEY'] },
    { key: 'harness.connectors.devin.apiKey', envVars: ['DEVIN_API_KEY'] },
    { key: 'harness.connectors.cursor.apiKey', envVars: ['CURSOR_API_KEY'] },
    { key: 'harness.connectors.kiro.apiKey', envVars: ['KIRO_API_KEY'] },
  ];

  // For the Copilot token: always try `gh auth token` first (freshest source),
  // then fall back to VS Code secrets. This avoids using a stale cached token.
  const liveGhToken = await getGhCliToken();
  if (liveGhToken) {
    env['GH_TOKEN'] = liveGhToken;
    // Keep secret in sync with the live token
    const stored = await context.secrets.get('harness.connectors.copilot.token');
    if (stored !== liveGhToken) {
      void context.secrets.store('harness.connectors.copilot.token', liveGhToken);
    }
  }

  // For all other secrets (claude, devin, cursor, kiro) — read from VS Code secrets
  for (const { key, envVars } of secretMap) {
    if (key === 'harness.connectors.copilot.token') {
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
  const claudePath = harness.get<string>('connectors.claude.path', 'claude');
  if (!env['CLAUDE_PATH']) {
    env['CLAUDE_PATH'] = claudePath;
  }

  const kiroCliPath =
    readCachedKiroCliPath() ??
    harness.get<string>('connectors.kiro.cliPath', 'kiro-cli');
  if (!env['KIRO_CLI_PATH']) {
    env['KIRO_CLI_PATH'] = kiroCliPath;
  }

  return env;
}
