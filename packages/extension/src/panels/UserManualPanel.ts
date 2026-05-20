import * as vscode from 'vscode';

interface ManualImageUrls {
  welcome: string;
  chatContext: string;
  configAgents: string;
  configApi: string;
}

export class UserManualPanel {
  static readonly VIEW_TYPE = 'harness.userManual';
  private static instance?: UserManualPanel;

  private readonly panel: vscode.WebviewPanel;

  private constructor(private readonly extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      UserManualPanel.VIEW_TYPE,
      'Harness of AI — User Manual',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')],
      },
    );

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage((raw: unknown) => {
      const msg = raw as { command: string };
      if (msg.command === 'ready') {
        void this.sendImages();
      }
      if (msg.command === 'openChat') {
        void vscode.commands.executeCommand('harness.chatView.focus');
      }
    });

    this.panel.onDidDispose(() => {
      UserManualPanel.instance = undefined;
    });
  }

  static createOrShow(extensionUri: vscode.Uri): void {
    if (UserManualPanel.instance) {
      UserManualPanel.instance.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    UserManualPanel.instance = new UserManualPanel(extensionUri);
  }

  private manualImageUrls(): ManualImageUrls {
    const webview = this.panel.webview;
    const base = vscode.Uri.joinPath(this.extensionUri, 'resources', 'manual');
    const uri = (name: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(base, name)).toString();
    return {
      welcome: uri('03-welcome.png'),
      chatContext: uri('04-chat-context.png'),
      configAgents: uri('01-chat-and-config-agents.png'),
      configApi: uri('02-config-api-servers.png'),
    };
  }

  private async sendImages(): Promise<void> {
    await this.panel.webview.postMessage({
      command: 'manualImages',
      payload: this.manualImageUrls(),
    });
  }

  private buildHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'manual', 'main.js'),
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
             img-src ${this.panel.webview.cspSource} data:;" />
  <title>Harness of AI — User Manual</title>
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
