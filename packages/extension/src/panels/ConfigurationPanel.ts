import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import type { AgentId, ConnectionResultPayload, SecretStatusPayload } from '../types';
import { buildCopilotAuthHeaders, validateCopilotToken } from '../copilotAuth';
import type { CliService } from '../services/CliService';

/**
 * Secret storage keys — API credentials are stored in VSCode's encrypted
 * SecretStorage, never in settings.json or on disk in plain text.
 */
const SECRET_KEYS: Record<AgentId, string> = {
  copilot: 'harness.connectors.copilot.token',
  claude:  'harness.connectors.claude.apiKey',
  devin:   'harness.connectors.devin.apiKey',
  cursor:  'harness.connectors.cursor.apiKey',
  kiro:    'harness.connectors.kiro.apiKey',
};

export class ConfigurationPanel {
  static readonly VIEW_TYPE = 'harness.configPanel';
  private static instance?: ConfigurationPanel;

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly cliService?: CliService,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      ConfigurationPanel.VIEW_TYPE,
      'Harness Configuration',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
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
        await config.update(key, value, vscode.ConfigurationTarget.Global);
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
        await vscode.commands.executeCommand('harness.chatView.focus');
        this.panel.dispose();
        break;

      case 'openSettingsJson':
        await vscode.commands.executeCommand('workbench.action.openSettingsJson');
        break;

      case 'openExtensionSettings':
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:harness-ai.harness-vscode',
        );
        break;

      case 'initWorkspace':
        await vscode.commands.executeCommand('harness.initWorkspace');
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
          if (!endpoint) return { agent, ok: false, error: 'Endpoint is required for Cursor AI' };
          await this.httpGet(new URL('/models', endpoint), { Authorization: `Bearer ${token}` });
          return { agent, ok: true };
        }
        case 'kiro': {
          if (!token) {
            return { agent, ok: false, error: 'KIRO_API_KEY is required for Kiro CLI headless mode' };
          }
          const cliPath = vscode.workspace
            .getConfiguration('harness')
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
    const config = vscode.workspace.getConfiguration('harness');
    const cfg = {
      specsDirectory: config.get<string>('specsDirectory', '.harness/specs'),
      defaultAgent: config.get<string>('defaultAgent', 'copilot'),
      cliPath: config.get<string>('cliPath', ''),
      mcpEnabled: config.get<boolean>('mcp.enabled', true),
      mcpServers: config.get<unknown[]>('mcp.servers', []),
    };
    await this.panel.webview.postMessage({ command: 'configLoaded', payload: cfg });
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
  <title>Harness Configuration</title>
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
