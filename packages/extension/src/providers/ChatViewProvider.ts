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
import { buildContextPathsForChat } from '../contextPaths.js';
import type {
  AgentId,
  AgentSelectionId,
  ChatAutoRoutedPayload,
  ChatMessage,
  ChatToolEventPayload,
  ContextItem,
  CopilotMode,
  ExtensionMessage,
  LiveEditEntry,
  WebviewMessage,
  InitializePayload,
  AGENT_DESCRIPTORS,
} from '../types';
import { AGENT_DESCRIPTORS as AGENTS } from '../types';
import { PROVIDER_MODEL_OPTIONS, modelsForSelection } from '../models/providerModels';
import type { CliService } from '../services/CliService';
import type { ContextProvider } from './ContextProvider';
import { AgentService } from '../services/AgentService';
import type { AgentEditTracker } from '../services/AgentEditTracker';
import type { AgentTerminalService } from '../services/AgentTerminalService';
import { traceLog } from '../trace';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  static readonly VIEW_ID = 'harness.chatView';

  private view?: vscode.WebviewView;
  private agentService: AgentService;
  private history: ChatMessage[] = [];
  private activeSessionId = crypto.randomUUID();
  private selectedAgent: AgentSelectionId;
  private selectedMode: CopilotMode = 'ask';
  private lastAutoRoute?: ChatAutoRoutedPayload;
  private sessionTokens = 0;
  private readonly modelByAgent = new Map<AgentSelectionId, string>();
  private liveEdits: LiveEditEntry[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly cliService: CliService,
    private readonly contextProvider: ContextProvider,
    private readonly output: vscode.LogOutputChannel,
    private readonly editTracker: AgentEditTracker,
    private readonly terminalService: AgentTerminalService,
  ) {
    this.agentService = new AgentService(cliService, output);
    this.selectedAgent = vscode.workspace
      .getConfiguration('harness')
      .get<AgentSelectionId>('defaultAgent', 'auto');
    this.modelByAgent.set(this.selectedAgent, 'auto');
  }

  private getSelectedModel(): string {
    return this.modelByAgent.get(this.selectedAgent) ?? 'auto';
  }

  private modelAgentKey(): AgentId | 'auto' {
    if (this.selectedAgent !== 'auto') {
      return this.selectedAgent;
    }
    return this.lastAutoRoute?.agent ?? 'copilot';
  }

  private postRevertState(): void {
    this.post({
      command: 'revertAvailable',
      payload: { canRevert: this.editTracker.hasPendingRevert(this.activeSessionId) },
    });
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

  /** View title command — clears chat messages, context files, and starts a new CLI session. */
  clearChatAndContext(): void {
    this.resetChat({ clearContext: true });
  }

  /** Toolbar "+ New chat" — clears messages only; context file chips stay attached. */
  startNewChatSession(): void {
    this.resetChat({ clearContext: false });
  }

  private resetChat(options: { clearContext: boolean }): void {
    const streaming = this.history.find((m) => m.streaming);
    if (streaming) {
      this.agentService.cancelSession(this.activeSessionId, () => {
        streaming.streaming = false;
        this.post({ command: 'streamStopped' });
      });
    }

    if (options.clearContext) {
      this.contextProvider.clear();
    }

    this.history = [];
    this.activeSessionId = crypto.randomUUID();
    this.lastAutoRoute = undefined;
    this.sessionTokens = 0;
    this.liveEdits = [];

    this.post({ command: 'chatCleared' });
    this.post({ command: 'liveEditsUpdated', payload: { edits: [] } });
    this.postRevertState();
    this.postTokenUsage();
    if (options.clearContext) {
      this.post({
        command: 'contextUpdated',
        payload: [] as ContextItem[],
      });
    }
  }

  async sendChatMessage(
    text: string,
    agent?: AgentSelectionId,
    mode?: CopilotMode,
  ): Promise<void> {
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

    this.editTracker.beginSession(this.activeSessionId);
    this.liveEdits = [];
    this.post({ command: 'liveEditsUpdated', payload: { edits: [] } });
    this.postRevertState();

    await this.agentService.chat({
      sessionId: this.activeSessionId,
      messages: this.history.slice(0, -1), // exclude the empty assistant placeholder
      contextPaths: buildContextPathsForChat(this.contextProvider),
      agent: this.selectedAgent,
      mode: this.selectedMode,
      specPaths,
      model: this.getSelectedModel(),
      onToolEvent: (event: ChatToolEventPayload) => {
        if (event.phase === 'terminal' && event.command) {
          this.terminalService.show(event.command);
        }
        void this.editTracker.handleToolEvent(event);
      },
      onAutoRouted: (route: ChatAutoRoutedPayload) => {
        this.lastAutoRoute = route;
        const msg = this.history.find((m) => m.id === assistantMessage.id);
        if (msg) {
          msg.agent = route.agent;
        }
        this.post({ command: 'autoRouted', payload: route });
      },
      onUsage: (usage) => {
        this.sessionTokens += usage.tokensTotal;
        this.postTokenUsage(usage.stats.total.tokensTotal);
      },
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
        this.editTracker.endSession(this.activeSessionId, true);
        this.postRevertState();
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
        this.editTracker.endSession(this.activeSessionId, true);
        this.postRevertState();
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
        this.editTracker.endSession(this.activeSessionId, true);
        this.postRevertState();
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
        const payload = msg.payload as {
          text: string;
          agent?: AgentSelectionId;
          mode?: CopilotMode;
        };
        await this.sendChatMessage(payload.text, payload.agent, payload.mode);
        break;
      }

      case 'selectAgent': {
        const payload = msg.payload as { agent: AgentSelectionId };
        this.selectedAgent = payload.agent;
        this.modelByAgent.set(payload.agent, 'auto');
        this.post({
          command: 'agentChanged',
          payload: { agent: this.selectedAgent },
        });
        this.post({
          command: 'modelChanged',
          payload: {
            selectedModel: 'auto',
            agent: payload.agent === 'auto' ? 'copilot' : payload.agent,
            providerModels: PROVIDER_MODEL_OPTIONS,
            models: modelsForSelection(payload.agent),
          },
        });
        break;
      }

      case 'selectModel': {
        const payload = msg.payload as { model: string };
        this.modelByAgent.set(this.selectedAgent, payload.model);
        this.post({
          command: 'modelChanged',
          payload: {
            selectedModel: payload.model,
            agent: this.modelAgentKey(),
            providerModels: PROVIDER_MODEL_OPTIONS,
            models: modelsForSelection(this.selectedAgent),
          },
        });
        break;
      }

      case 'revertAgentChanges':
        void this.revertAgentChanges();
        break;

      case 'focusAgentTerminal':
        this.terminalService.focus();
        break;

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
        this.resetChat({ clearContext: true });
        break;

      case 'newChat':
        this.resetChat({ clearContext: false });
        break;

      case 'showContext':
        await vscode.commands.executeCommand('harness.showContext');
        break;

      case 'openConfig':
        await vscode.commands.executeCommand('harness.openConfig');
        break;

      case 'openFile': {
        const payload = msg.payload as { path: string; line?: number; column?: number };
        await this.openFileAtLocation(payload.path, payload.line, payload.column);
        break;
      }

      case 'stopStream': {
        traceLog(this.output, 'ChatView', 'stopStream', { sessionId: this.activeSessionId });
        const streaming = this.history.find((m) => m.streaming);
        this.agentService.cancelSession(this.activeSessionId, () => {
          if (streaming) {
            streaming.streaming = false;
          }
          this.editTracker.endSession(this.activeSessionId, true);
          this.postRevertState();
          this.post({ command: 'streamStopped' });
        });
        break;
      }

      default:
        this.output.warn(`Unknown webview command: ${msg.command}`);
    }
  }

  async revertAgentChanges(): Promise<void> {
    await this.editTracker.revertSession(this.activeSessionId);
    this.liveEdits = [];
    this.post({ command: 'liveEditsUpdated', payload: { edits: [] } });
    this.postRevertState();
  }

  /** Called by extension when live edits change (diff UI). */
  notifyLiveEdits(sessionId: string, edits: LiveEditEntry[]): void {
    if (sessionId !== this.activeSessionId) {
      return;
    }
    this.liveEdits = edits;
    this.post({ command: 'liveEditsUpdated', payload: { edits } });
    this.postRevertState();
  }

  private sendInitialize(): void {
    const initPayload: InitializePayload = {
      agent: this.selectedAgent,
      mode: this.selectedMode,
      context: this.contextProvider.getItems(),
      history: this.history,
      agents: Object.values(AGENTS),
      selectedModel: this.getSelectedModel(),
      providerModels: PROVIDER_MODEL_OPTIONS,
      liveEdits: this.liveEdits,
      canRevert: this.editTracker.hasPendingRevert(this.activeSessionId),
      ...(this.lastAutoRoute ? { lastAutoRoute: this.lastAutoRoute } : {}),
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

  private postTokenUsage(lifetimeTokens?: number): void {
    this.post({
      command: 'tokenUsage',
      payload: {
        sessionTokens: this.sessionTokens,
        dailyTokens: lifetimeTokens ?? this.sessionTokens,
        budgetTokens: 0,
      },
    });
  }

  /** Open a file in the editor, optionally at a specific line/column (Cursor-style refs). */
  private async openFileAtLocation(
    filePath: string,
    line?: number,
    column?: number,
  ): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const abs = path.isAbsolute(filePath)
      ? filePath
      : workspaceRoot
        ? path.join(workspaceRoot, filePath)
        : filePath;

    if (!fs.existsSync(abs)) {
      void vscode.window.showWarningMessage(`File not found: ${filePath}`);
      return;
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
    const editor = await vscode.window.showTextDocument(doc, { preview: true });

    if (line !== undefined && line > 0) {
      const pos = new vscode.Position(line - 1, column ?? 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter,
      );
    }
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
  <title>Harness of AI Chat</title>
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
