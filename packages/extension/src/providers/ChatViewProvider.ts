/**
 * @module providers/ChatViewProvider
 * VS Code webview for the Harness chat sidebar.
 *
 * **Why:** UI runs in an isolated webview; this provider is the extension-host bridge:
 * webview postMessage ↔ `AgentService` ↔ CLI IPC.
 *
 * **State:** conversation history, selected `AgentId`, selected `CopilotMode`.
 * For `spec+agent`, resolves `.harness/specs/*.{yaml,yml,json}` paths before each send.
 *
 * @see webview/chat/main.ts — browser UI (mode bar, agent dropdown, streaming render)
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AgentId,
  ChatMessage,
  ContextItem,
  CopilotMode,
  ExtensionMessage,
  WebviewMessage,
  InitializePayload,
  AGENT_DESCRIPTORS,
} from '../types';
import { AGENT_DESCRIPTORS as AGENTS } from '../types';
import type { CliService } from '../services/CliService';
import type { ContextProvider } from './ContextProvider';
import { AgentService } from '../services/AgentService';
import { traceLog } from '../trace';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  static readonly VIEW_ID = 'harness.chatView';

  private view?: vscode.WebviewView;
  private agentService: AgentService;
  private history: ChatMessage[] = [];
  private activeSessionId = crypto.randomUUID();
  private selectedAgent: AgentId;
  private selectedMode: CopilotMode = 'ask';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly cliService: CliService,
    private readonly contextProvider: ContextProvider,
    private readonly output: vscode.LogOutputChannel,
  ) {
    this.agentService = new AgentService(cliService, output);
    this.selectedAgent = vscode.workspace
      .getConfiguration('harness')
      .get<AgentId>('defaultAgent', 'copilot');
  }

  // ---------------------------------------------------------------------------
  // WebviewViewProvider implementation
  // ---------------------------------------------------------------------------

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
      const msg = raw as WebviewMessage;
      void this.handleWebviewMessage(msg);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendInitialize();
      }
    });

    this.sendInitialize();
  }

  // ---------------------------------------------------------------------------
  // Public API called from extension.ts
  // ---------------------------------------------------------------------------

  notifyContextChanged(): void {
    this.post({
      command: 'contextUpdated',
      payload: this.contextProvider.getItems(),
    });
  }

  async sendChatMessage(text: string, agent?: AgentId, mode?: CopilotMode): Promise<void> {
    if (agent) {
      this.selectedAgent = agent;
    }
    if (mode) {
      this.selectedMode = mode;
    }

    traceLog(this.output, 'ChatView', 'sendMessage', {
      agent: this.selectedAgent,
      mode: this.selectedMode,
      textLength: text.length,
    });

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    this.history.push(userMessage);

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      agent: this.selectedAgent,
      streaming: true,
    };

    this.history.push(assistantMessage);

    // Notify webview of the new user message immediately
    this.post({ command: 'appendChunk', payload: { message: userMessage, done: false } });
    this.post({ command: 'appendChunk', payload: { message: assistantMessage, done: false } });

    // For spec+agent mode: collect spec files from the workspace specsDir
    const specPaths = this.selectedMode === 'spec+agent'
      ? this.resolveSpecPaths()
      : [];

    await this.agentService.chat({
      sessionId: this.activeSessionId,
      messages: this.history.slice(0, -1), // exclude the empty assistant placeholder
      contextPaths: this.contextProvider.getAbsolutePaths(),
      agent: this.selectedAgent,
      mode: this.selectedMode,
      specPaths,
      onChunk: (chunk: string, messageId: string) => {
        // Accumulate chunk in local history
        const msg = this.history.find((m) => m.id === assistantMessage.id);
        if (msg) {
          msg.content += chunk;
        }
        this.post({
          command: 'appendChunk',
          payload: { messageId: assistantMessage.id, chunk, done: false },
        });
      },
      onComplete: (_messageId: string) => {
        const msg = this.history.find((m) => m.id === assistantMessage.id);
        if (msg) {
          msg.streaming = false;
        }
        this.post({
          command: 'messageComplete',
          payload: { messageId: assistantMessage.id },
        });
      },
      onError: (error: string, _messageId: string) => {
        const msg = this.history.find((m) => m.id === assistantMessage.id);
        if (msg) {
          msg.streaming = false;
          msg.error = error;
        }
        this.post({
          command: 'messageError',
          payload: { messageId: assistantMessage.id, error },
        });
      },
      onStopped: () => {
        const msg = this.history.find((m) => m.id === assistantMessage.id);
        if (msg) {
          msg.streaming = false;
        }
        this.post({ command: 'streamStopped' });
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private message handling
  // ---------------------------------------------------------------------------

  private async handleWebviewMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.command) {
      case 'ready':
        this.sendInitialize();
        break;

      case 'sendMessage': {
        const payload = msg.payload as { text: string; agent?: AgentId; mode?: CopilotMode };
        await this.sendChatMessage(payload.text, payload.agent, payload.mode);
        break;
      }

      case 'selectAgent': {
        const payload = msg.payload as { agent: AgentId };
        this.selectedAgent = payload.agent;
        this.post({ command: 'agentChanged', payload: { agent: this.selectedAgent } });
        break;
      }

      case 'selectMode': {
        const payload = msg.payload as { mode: CopilotMode };
        this.selectedMode = payload.mode;
        this.post({ command: 'modeChanged', payload: { mode: this.selectedMode } });
        break;
      }

      case 'addContext': {
        const payload = msg.payload as { absolutePath: string };
        await this.contextProvider.add(vscode.Uri.file(payload.absolutePath));
        this.notifyContextChanged();
        break;
      }

      case 'removeContext': {
        const payload = msg.payload as { absolutePath: string };
        this.contextProvider.remove(payload.absolutePath);
        this.notifyContextChanged();
        break;
      }

      case 'clearContext':
        this.contextProvider.clear();
        this.notifyContextChanged();
        break;

      case 'showContext':
        await vscode.commands.executeCommand('harness.showContext');
        break;

      case 'openConfig':
        await vscode.commands.executeCommand('harness.openConfig');
        break;

      case 'stopStream': {
        traceLog(this.output, 'ChatView', 'stopStream', { sessionId: this.activeSessionId });
        const streaming = this.history.find((m) => m.streaming);
        this.agentService.cancelSession(this.activeSessionId, () => {
          if (streaming) {
            streaming.streaming = false;
          }
          this.post({ command: 'streamStopped' });
        });
        break;
      }

      default:
        this.output.warn(`Unknown webview command: ${msg.command}`);
    }
  }

  private sendInitialize(): void {
    const initPayload: InitializePayload = {
      agent: this.selectedAgent,
      mode: this.selectedMode,
      context: this.contextProvider.getItems(),
      history: this.history,
      agents: Object.values(AGENTS),
    };
    this.post({ command: 'initialize', payload: initPayload });
  }

  /** Resolve all spec YAML/JSON files from the configured specs directory. */
  private resolveSpecPaths(): string[] {
    const specsDir = vscode.workspace
      .getConfiguration('harness')
      .get<string>('specsDirectory', '.harness/specs');

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];

    const absSpecsDir = path.isAbsolute(specsDir)
      ? specsDir
      : path.join(workspaceRoot, specsDir);

    if (!fs.existsSync(absSpecsDir)) return [];

    try {
      return fs
        .readdirSync(absSpecsDir)
        .filter(f => /\.(yaml|yml|json)$/i.test(f))
        .map(f => path.join(absSpecsDir, f));
    } catch {
      return [];
    }
  }

  private post(msg: ExtensionMessage): void {
    void this.view?.webview.postMessage(msg);
  }

  // ---------------------------------------------------------------------------
  // HTML generation
  // ---------------------------------------------------------------------------

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'chat', 'main.js'),
    );

    const nonce = this.generateNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' ${webview.cspSource};
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource};
             img-src ${webview.cspSource} data:;" />
  <title>Harness Chat</title>
  <style>
    :root {
      --container-padding: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #root {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
  </style>
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
