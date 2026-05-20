import * as vscode from 'vscode';

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
        localResourceRoots: [extensionUri],
      },
    );

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage((raw: unknown) => {
      const msg = raw as { command: string };
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
             style-src ${this.panel.webview.cspSource} 'unsafe-inline';" />
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
