import * as vscode from 'vscode';

/**
 * Configuration panel — opens as a full editor panel and provides a rich
 * UI for setting Harness workspace preferences and agent connector credentials.
 *
 * For credential fields we open VSCode's native settings editor rather than
 * storing keys in the webview, so secrets stay in the settings keychain.
 */
export class ConfigurationPanel {
  static readonly VIEW_TYPE = 'harness.configPanel';
  private static instance?: ConfigurationPanel;

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
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

  static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
    if (ConfigurationPanel.instance) {
      ConfigurationPanel.instance.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    ConfigurationPanel.instance = new ConfigurationPanel(extensionUri, context);
  }

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------

  private async handleMessage(msg: { command: string; payload?: unknown }): Promise<void> {
    switch (msg.command) {
      case 'ready':
        await this.sendCurrentConfig();
        break;

      case 'saveSetting': {
        const { key, value } = msg.payload as { key: string; value: unknown };
        const config = vscode.workspace.getConfiguration();
        await config.update(key, value, vscode.ConfigurationTarget.Global);
        void vscode.window.showInformationMessage(`Setting saved: ${key}`);
        break;
      }

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

  private async sendCurrentConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration('harness');
    const settings = {
      specsDirectory: config.get<string>('specsDirectory', '.harness/specs'),
      contextDirectories: config.get<string[]>('contextDirectories', []),
      defaultAgent: config.get<string>('defaultAgent', 'copilot'),
      cliPath: config.get<string>('cliPath', ''),
      connectors: {
        copilot: {
          endpoint: config.get<string>('connectors.copilot.endpoint', ''),
          hasToken: !!config.get<string>('connectors.copilot.token', ''),
        },
        devin: {
          endpoint: config.get<string>('connectors.devin.endpoint', ''),
          hasApiKey: !!config.get<string>('connectors.devin.apiKey', ''),
        },
        cursor: {
          endpoint: config.get<string>('connectors.cursor.endpoint', ''),
          hasApiKey: !!config.get<string>('connectors.cursor.apiKey', ''),
        },
        claude: {
          path: config.get<string>('connectors.claude.path', 'claude'),
          hasApiKey: !!config.get<string>('connectors.claude.apiKey', ''),
        },
        kiro: {
          endpoint: config.get<string>('connectors.kiro.endpoint', ''),
          hasApiKey: !!config.get<string>('connectors.kiro.apiKey', ''),
        },
      },
      mcp: {
        enabled: config.get<boolean>('mcp.enabled', true),
        servers: config.get<unknown[]>('mcp.servers', []),
      },
    };

    await this.panel.webview.postMessage({ command: 'configLoaded', payload: settings });
  }

  // ---------------------------------------------------------------------------
  // HTML
  // ---------------------------------------------------------------------------

  private buildHtml(): string {
    const nonce = this.generateNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>Harness Configuration</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px 32px;
      max-width: 800px;
    }
    h1 { font-size: 20px; margin-bottom: 4px; }
    h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 4px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 24px; font-size: 12px; }
    .field { margin-bottom: 12px; }
    label { display: block; font-size: 12px; margin-bottom: 4px; font-weight: 600; }
    .field-desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
    input[type="text"], input[type="password"] {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 5px 8px;
      border-radius: 2px;
      font-size: var(--vscode-font-size);
      font-family: var(--vscode-font-family);
    }
    input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
    select {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      padding: 5px 8px;
      border-radius: 2px;
      font-size: var(--vscode-font-size);
      font-family: var(--vscode-font-family);
    }
    .connector-card {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .connector-card h3 { font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .status-dot--ok { background: var(--vscode-testing-iconPassed); }
    .status-dot--missing { background: var(--vscode-testing-iconFailed); }
    .actions { margin-top: 24px; display: flex; gap: 8px; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      border-radius: 2px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      font-family: var(--vscode-font-family);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .notice {
      padding: 8px 12px;
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      border-radius: 4px;
      font-size: 12px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <h1>Harness Configuration</h1>
  <p class="subtitle">Configure your AI agent connectors, workspace settings, and MCP servers.</p>

  <div id="config-content">
    <p>Loading configuration…</p>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function post(command, payload) {
      vscode.postMessage({ command, payload });
    }

    function saveSetting(key, value) {
      post('saveSetting', { key, value });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'configLoaded') {
        renderConfig(msg.payload);
      }
    });

    function renderConfig(cfg) {
      const el = document.getElementById('config-content');
      el.innerHTML = \`
        <h2>General</h2>
        <div class="field">
          <label>Default Agent</label>
          <select id="defaultAgent" onchange="saveSetting('harness.defaultAgent', this.value)">
            <option value="copilot" \${cfg.defaultAgent==='copilot'?'selected':''}>GitHub Copilot</option>
            <option value="devin"   \${cfg.defaultAgent==='devin'  ?'selected':''}>Devin</option>
            <option value="cursor"  \${cfg.defaultAgent==='cursor' ?'selected':''}>Cursor AI</option>
            <option value="claude"  \${cfg.defaultAgent==='claude' ?'selected':''}>Claude Code</option>
            <option value="kiro"    \${cfg.defaultAgent==='kiro'   ?'selected':''}>AWS KIRO</option>
          </select>
          <div class="field-desc">Agent used when no agent is specified in a Spec.</div>
        </div>

        <div class="field">
          <label>Specs Directory</label>
          <input type="text" id="specsDir" value="\${cfg.specsDirectory}"
            onchange="saveSetting('harness.specsDirectory', this.value)" />
          <div class="field-desc">Path relative to workspace root where SDD specs are stored.</div>
        </div>

        <div class="field">
          <label>CLI Path (optional)</label>
          <input type="text" id="cliPath" value="\${cfg.cliPath}"
            onchange="saveSetting('harness.cliPath', this.value)"
            placeholder="Leave empty to use bundled CLI" />
        </div>

        <h2>Agent Connectors</h2>
        <div class="notice">
          API keys and tokens are stored in VSCode settings. Use the <em>settings.json</em> editor
          to set sensitive values, or open the Extension Settings page.
        </div>

        \${renderConnector('GitHub Copilot', 'copilot', cfg.connectors.copilot)}
        \${renderConnector('Devin', 'devin', cfg.connectors.devin)}
        \${renderConnector('Cursor AI', 'cursor', cfg.connectors.cursor)}
        \${renderConnector('Claude Code', 'claude', cfg.connectors.claude)}
        \${renderConnector('AWS KIRO', 'kiro', cfg.connectors.kiro)}

        <h2>MCP Servers</h2>
        <div class="field">
          <label>
            <input type="checkbox" id="mcp-enabled" \${cfg.mcp.enabled?'checked':''}
              onchange="saveSetting('harness.mcp.enabled', this.checked)" />
            Enable MCP Client
          </label>
          <div class="field-desc">Connect to Model Context Protocol servers for additional tools and resources.</div>
        </div>
        <div class="field-desc">
          Configure MCP servers in <code>harness.mcp.servers</code> via the settings JSON editor.
          Each server requires <code>name</code>, <code>transport</code> (stdio or http),
          and either <code>command</code> or <code>url</code>.
        </div>

        <div class="actions">
          <button onclick="post('openExtensionSettings')">Open Extension Settings</button>
          <button class="secondary" onclick="post('openSettingsJson')">Edit settings.json</button>
          <button class="secondary" onclick="post('initWorkspace')">Initialize Workspace</button>
        </div>
      \`;
    }

    function renderConnector(label, id, cfg) {
      const hasKey = cfg.hasToken || cfg.hasApiKey;
      const hasEndpoint = !!cfg.endpoint || !!cfg.path;
      const ok = hasKey || id === 'claude';
      return \`
        <div class="connector-card">
          <h3>
            <span class="status-dot \${ok ? 'status-dot--ok' : 'status-dot--missing'}"></span>
            \${label}
          </h3>
          \${cfg.endpoint !== undefined ? \`
          <div class="field">
            <label>Endpoint</label>
            <input type="text" value="\${cfg.endpoint}"
              onchange="saveSetting('harness.connectors.\${id}.endpoint', this.value)"
              placeholder="https://..." />
          </div>\` : ''}
          \${cfg.path !== undefined ? \`
          <div class="field">
            <label>CLI Path</label>
            <input type="text" value="\${cfg.path}"
              onchange="saveSetting('harness.connectors.\${id}.path', this.value)"
              placeholder="claude" />
          </div>\` : ''}
          <div class="field-desc">
            API Key / Token: \${hasKey ? '✓ configured (set via settings.json)' : '✗ not configured'}
          </div>
        </div>\`;
    }

    post('ready');
  </script>
</body>
</html>`;
  }

  private generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}
