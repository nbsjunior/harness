import * as vscode from 'vscode';
import * as path from 'path';
import type { ExtensionMessage, LiveEditEntry, LiveEditsPanelPayload, WebviewMessage } from '../types';

/**
 * Sidebar webview beside Chat — shows live agent file edits (before/after).
 */
export class LiveEditsViewProvider implements vscode.WebviewViewProvider {
  static readonly VIEW_ID = 'toddspect.liveEditsView';

  private view?: vscode.WebviewView;
  private edits: LiveEditEntry[] = [];
  private canRevert = false;
  private activePath?: string;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.buildHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((raw: unknown) => {
      void this.handleMessage(raw as WebviewMessage);
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.postState();
      }
    });
    this.postState();
  }

  update(edits: LiveEditEntry[], canRevert: boolean): void {
    this.edits = edits;
    this.canRevert = canRevert;
    const last = [...edits].reverse().find((e) => e.phase === 'after' && e.path);
    if (last?.path) {
      this.activePath = last.path;
    }
    this.postState();
  }

  private postState(): void {
    this.post({
      command: 'liveEditsPanel',
      payload: {
        edits: this.edits,
        canRevert: this.canRevert,
        activePath: this.activePath,
      } satisfies LiveEditsPanelPayload,
    });
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.command) {
      case 'ready':
        this.postState();
        break;
      case 'openFile': {
        const p = msg.payload as { path: string };
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const abs = path.isAbsolute(p.path) ? p.path : path.join(root, p.path);
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
          await vscode.window.showTextDocument(doc, { preview: false });
        } catch {
          void vscode.window.showWarningMessage(`File not found: ${p.path}`);
        }
        break;
      }
      case 'revertAgentChanges':
        await vscode.commands.executeCommand('toddspect.revertAgentChanges');
        break;
      default:
        break;
    }
  }

  private post(msg: ExtensionMessage): void {
    void this.view?.webview.postMessage(msg);
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'live-edits', 'main.js'),
    );
    const nonce = Array.from({ length: 32 }, () =>
      'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)),
    ).join('');
    const csp = webview.cspSource;

    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8" />',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${csp}; style-src ${csp} 'unsafe-inline';" />`,
      '<title>Live Edits</title>',
      '</head>',
      '<body>',
      '<motion id="root"></motion>',
      `<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`,
      '</body>',
      '</html>',
    ]
      .join('\n')
      .replace('<motion id="root"></motion>', '<div id="root"></div>');
  }
}
