import * as vscode from 'vscode';
import type {
  AgentId,
  ChatMessage,
  ContextItem,
  ExtensionMessage,
  WebviewMessage,
  InitializePayload,
  AGENT_DESCRIPTORS,
} from '../types';
import { AGENT_DESCRIPTORS as AGENTS } from '../types';
import type { CliService } from '../services/CliService';
import type { ContextProvider } from './ContextProvider';
import { AgentService } from '../services/AgentService';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  static readonly VIEW_ID = 'harness.chatView';

  private view?: vscode.WebviewView;
  private agentService: AgentService;
  private history: ChatMessage[] = [];
  private activeSessionId = crypto.randomUUID();
  private selectedAgent: AgentId;

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

  async sendChatMessage(text: string, agent?: AgentId): Promise<void> {
    if (agent) {
      this.selectedAgent = agent;
    }

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

    await this.agentService.chat({
      sessionId: this.activeSessionId,
      messages: this.history.slice(0, -1), // exclude the empty assistant placeholder
      contextPaths: this.contextProvider.getAbsolutePaths(),
      agent: this.selectedAgent,
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
        const payload = msg.payload as { text: string; agent?: AgentId };
        await this.sendChatMessage(payload.text, payload.agent);
        break;
      }

      case 'selectAgent': {
        const payload = msg.payload as { agent: AgentId };
        this.selectedAgent = payload.agent;
        this.post({ command: 'agentChanged', payload: { agent: this.selectedAgent } });
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

      default:
        this.output.warn(`Unknown webview command: ${msg.command}`);
    }
  }

  private sendInitialize(): void {
    const initPayload: InitializePayload = {
      agent: this.selectedAgent,
      context: this.contextProvider.getItems(),
      history: this.history,
      agents: Object.values(AGENTS),
    };
    this.post({ command: 'initialize', payload: initPayload });
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
