import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AgentId } from './types';

function readCachedKiroCliPath(): string | undefined {
  const marker = path.join(os.homedir(), '.harness', 'tools', 'kiro-cli', 'kiro-cli-path.txt');
  if (!fs.existsSync(marker)) {
    return undefined;
  }
  const p = fs.readFileSync(marker, 'utf-8').trim();
  return p && fs.existsSync(p) ? p : undefined;
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
    defaultAgent: harness.get<AgentId>('defaultAgent', 'copilot'),
    connectors: {
      copilot: {
        endpoint: harness.get<string>('connectors.copilot.endpoint', 'https://api.githubcopilot.com'),
      },
      devin: {
        endpoint: harness.get<string>('connectors.devin.endpoint', 'https://api.devin.ai/v1'),
      },
      cursor: {
        endpoint: harness.get<string>('connectors.cursor.endpoint', ''),
        apiKey: harness.get<string>('connectors.cursor.apiKey', ''),
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

  for (const { key, envVars } of secretMap) {
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
