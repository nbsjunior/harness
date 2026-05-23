import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import type {
  AgentId,
  ConnectionResultPayload,
  SecretStatusPayload,
  UsageStatsPayload,
} from '../types';
import { resolveToddSpectWorkspacePath } from '../workspacePath.js';
import { buildCopilotAuthHeaders, validateCopilotToken } from '../copilotAuth';
import type { CliService } from '../services/CliService';
import { UserManualPanel } from './UserManualPanel.js';

/**
 * Secret storage keys — API credentials are stored in VSCode's encrypted
 * SecretStorage, never in settings.json or on disk in plain text.
 */
export interface ApiServerEntry {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
}

const SECRET_KEYS: Record<AgentId, string> = {
  copilot: 'toddspect.connectors.copilot.token',
  claude:  'toddspect.connectors.claude.apiKey',
  devin:   'toddspect.connectors.devin.apiKey',
  cursor:  'toddspect.connectors.cursor.apiKey',
  kiro:    'toddspect.connectors.kiro.apiKey',
};

export class ConfigurationPanel {
  static readonly VIEW_TYPE = 'toddspect.configPanel';
  private static instance?: ConfigurationPanel;

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly cliService?: CliService,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      ConfigurationPanel.VIEW_TYPE,
      'ToddSpect Configuration',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          extensionUri,
          vscode.Uri.joinPath(extensionUri, 'resources'),
        ],
      },
    );

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage((raw: unknown) => {
      const msg = raw as { command: string; payload?: unknown };
      void this.handleMessage(msg);
    });

    this.panel.onDidDispose(() => {
      ConfigurationPanel.instance = undefined;
    });
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    cliService?: CliService,
  ): void {
    if (ConfigurationPanel.instance) {
      ConfigurationPanel.instance.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    ConfigurationPanel.instance = new ConfigurationPanel(extensionUri, context, cliService);
  }

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------

  private async handleMessage(msg: { command: string; payload?: unknown }): Promise<void> {
    switch (msg.command) {

      case 'ready': {
        await this.sendCurrentConfig();
        await this.sendSecretStatus();
        break;
      }

      case 'openUserManual': {
        UserManualPanel.createOrShow(this.extensionUri);
        break;
      }

      case 'saveSecret': {
        const { key, value } = msg.payload as { key: string; value: string };
        await this.context.secrets.store(key, value);
        this.context.globalState.update(`${key}__set`, true);
        await this.sendSecretStatus();
        if (this.cliService) {
          await this.cliService.restart().catch((err: Error) => {
            void vscode.window.showWarningMessage(
              `Token saved, but CLI restart failed: ${err.message}`,
            );
          });
        }
        break;
      }

      case 'saveSetting': {
        const { key, value } = msg.payload as { key: string; value: unknown };
        if (key === '__openUrl') {
          await vscode.env.openExternal(vscode.Uri.parse(String(value)));
          break;
        }
        const config = vscode.workspace.getConfiguration();
        await config.update(key, value, configurationTarget(key));
        if (
          key === 'toddspect.defaultWorkspace' &&
          this.cliService &&
          typeof value === 'string' &&
          value.trim()
        ) {
          await this.cliService.restart().catch(() => undefined);
        }
        break;
      }

      case 'getUsageStats': {
        await this.sendUsageStats();
        break;
      }

      case 'resetUsageStats': {
        if (!this.cliService) {
          break;
        }
        try {
          const response = await this.cliService.send<Record<string, never>, UsageStatsPayload>(
            { id: crypto.randomUUID(), action: 'usage:reset', payload: {} },
            { expectResponse: 'usage:reset:result', timeoutMs: 15_000 },
          );
          await this.panel.webview.postMessage({
            command: 'usageStats',
            payload: response.payload,
          });
        } catch (err) {
          void vscode.window.showErrorMessage(
            `Failed to reset usage stats: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        break;
      }

      case 'testConnection': {
        const { agent, token, endpoint } = msg.payload as {
          agent: AgentId;
          token: string;
          endpoint: string;
        };
        const result = await this.testConnection(agent, token, endpoint);
        void this.panel.webview.postMessage({ command: 'connectionResult', payload: result });
        break;
      }

      case 'getSecretStatus':
        await this.sendSecretStatus();
        break;

      case 'openChat':
        await vscode.commands.executeCommand('toddspect.chatView.focus');
        this.panel.dispose();
        break;

      case 'openSettingsJson':
        await vscode.commands.executeCommand('workbench.action.openSettingsJson');
        break;

      case 'openExtensionSettings':
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:toddspect.toddspect-vscode',
        );
        break;

      case 'initWorkspace':
        await vscode.commands.executeCommand('toddspect.initWorkspace');
        break;

      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Test connection per agent
  // ---------------------------------------------------------------------------

  private async testConnection(
    agent: AgentId,
    token: string,
    endpoint: string,
  ): Promise<ConnectionResultPayload> {
    try {
      switch (agent) {
        case 'copilot': {
          const tokenError = validateCopilotToken(token);
          if (tokenError) {
            return { agent, ok: false, error: tokenError };
          }
          const ep = endpoint || 'https://api.githubcopilot.com';
          const result = await this.httpGet(
            new URL('/models', ep),
            buildCopilotAuthHeaders(token),
          );
          const data = JSON.parse(result) as { data?: Array<{ id: string }> };
          const model = data.data?.[0]?.id ?? 'gpt-4o';
          return { agent, ok: true, model };
        }
        case 'claude': {
          const result = await this.httpGet(
            new URL('/v1/models', 'https://api.anthropic.com'),
            { 'x-api-key': token, 'anthropic-version': '2023-06-01' },
          );
          const data = JSON.parse(result) as { data?: Array<{ id: string }> };
          const model = data.data?.[0]?.id ?? 'claude-opus-4-5';
          return { agent, ok: true, model };
        }
        case 'devin': {
          const ep = endpoint || 'https://api.devin.ai/v1';
          await this.httpGet(new URL('/sessions', ep), { Authorization: `Bearer ${token}` });
          return { agent, ok: true };
        }
        case 'cursor': {
          const base = (endpoint || 'https://api.cursor.com').replace(/\/+$/, '');
          const auth = `Basic ${Buffer.from(`${token}:`, 'utf-8').toString('base64')}`;
          await this.httpGet(new URL('/v1/me', base), {
            Authorization: auth,
            Accept: 'application/json',
          });
          return { agent, ok: true, model: 'Cloud Agents API v1' };
        }
        case 'kiro': {
          if (!token) {
            return { agent, ok: false, error: 'KIRO_API_KEY is required for Kiro CLI headless mode' };
          }
          const cliPath = vscode.workspace
            .getConfiguration('toddspect')
            .get<string>('connectors.kiro.cliPath', 'kiro-cli');
          return { agent, ok: true, model: `kiro-cli (${cliPath}) + AI-DLC steering` };
        }
        default:
          return { agent, ok: false, error: 'Unknown agent' };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { agent, ok: false, error: msg };
    }
  }

  private httpGet(url: URL, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(url, { method: 'GET', headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 120)}`));
          } else {
            resolve(body);
          }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Send helpers
  // ---------------------------------------------------------------------------

  private async sendCurrentConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration('toddspect');
    const cfg = {
      specsDirectory: config.get<string>('specsDirectory', '.toddspect/specs'),
      defaultAgent: config.get<string>('defaultAgent', 'copilot'),
      defaultWorkspace: config.get<string>('defaultWorkspace', ''),
      resolvedWorkspace: resolveToddSpectWorkspacePath() ?? '',
      cliPath: config.get<string>('cliPath', ''),
      promptOptimization: {
        enabled: config.get<boolean>('promptOptimization.enabled', true),
        maxContextCharsPerFile: config.get<number>('promptOptimization.maxContextCharsPerFile', 12_000),
        maxHistoryMessages: config.get<number>('promptOptimization.maxHistoryMessages', 24),
      },
      spending: {
        budgetEnabled: config.get<boolean>('spending.budgetEnabled', false),
        budgetTotalTokens: config.get<number>('spending.budgetTotalTokens', 0),
        budgetWarnPercent: config.get<number>('spending.budgetWarnPercent', 80),
        budgetTokensByAgent: config.get<Record<string, number>>('spending.budgetTokensByAgent', {}),
      },
      mcpEnabled: config.get<boolean>('mcp.enabled', true),
      mcpServers: config.get<unknown[]>('mcp.servers', []),
      apiServers: config.get<ApiServerEntry[]>('apiServers', []),
      agentEndpoints: {
        copilot: config.get<string>('connectors.copilot.endpoint', 'https://api.githubcopilot.com'),
        devin: config.get<string>('connectors.devin.endpoint', 'https://api.devin.ai/v1'),
        cursor: config.get<string>('connectors.cursor.endpoint', ''),
        kiro: config.get<string>('connectors.kiro.endpoint', ''),
      },
    };
    await this.panel.webview.postMessage({ command: 'configLoaded', payload: cfg });
    await this.sendUsageStats();
  }

  private async sendUsageStats(): Promise<void> {
    if (!this.cliService) {
      return;
    }
    try {
      const response = await this.cliService.send<Record<string, never>, UsageStatsPayload>(
        { id: crypto.randomUUID(), action: 'usage:get', payload: {} },
        { expectResponse: 'usage:stats', timeoutMs: 15_000 },
      );
      await this.panel.webview.postMessage({
        command: 'usageStats',
        payload: response.payload,
      });
    } catch {
      // CLI may still be starting — Spending tab shows empty state
    }
  }

  private async sendSecretStatus(): Promise<void> {
    const status: SecretStatusPayload = {
      copilot: !!(await this.context.secrets.get(SECRET_KEYS.copilot)),
      claude:  !!(await this.context.secrets.get(SECRET_KEYS.claude)),
      devin:   !!(await this.context.secrets.get(SECRET_KEYS.devin)),
      cursor:  !!(await this.context.secrets.get(SECRET_KEYS.cursor)),
      kiro:    !!(await this.context.secrets.get(SECRET_KEYS.kiro)),
    };
    await this.panel.webview.postMessage({ command: 'secretStatus', payload: status });
  }

  // ---------------------------------------------------------------------------
  // HTML — loads the bundled config webview JS
  // ---------------------------------------------------------------------------

  private buildHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'config', 'main.js'),
    );
    const nonce = this.generateNonce();

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' ${this.panel.webview.cspSource};
             style-src ${this.panel.webview.cspSource} 'unsafe-inline';
             font-src ${this.panel.webview.cspSource};
             img-src ${this.panel.webview.cspSource} data:;" />
  <title>ToddSpect Configuration</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}

function configurationTarget(key: string): vscode.ConfigurationTarget {
  if (
    key === 'toddspect.cliPath' ||
    key.startsWith('toddspect.connectors.') ||
    key === 'toddspect.telemetry.enabled' ||
    key === 'toddspect.mcp.enabled' ||
    key.startsWith('toddspect.mcp.servers')
  ) {
    return vscode.ConfigurationTarget.Global;
  }
  return vscode.ConfigurationTarget.Workspace;
}
