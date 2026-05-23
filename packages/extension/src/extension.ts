import * as vscode from 'vscode';
import * as path from 'path';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { SpecManagerProvider } from './panels/SpecManagerPanel';
import { ConfigurationPanel } from './panels/ConfigurationPanel';
import { UserManualPanel } from './panels/UserManualPanel';
import { ContextProvider } from './providers/ContextProvider';
import { CliService } from './services/CliService';
import { McpClientManager } from './mcp/McpClientManager';
import { ToddSnapshotProvider } from './services/ToddSnapshotProvider';
import { AgentEditTracker } from './services/AgentEditTracker';
import { AgentTerminalService } from './services/AgentTerminalService';
import type { AgentId, AgentSelectionId } from './types';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('Todd', { log: true });
  outputChannel.info('Todd extension activating… (View → Output → Todd for full trace)');

  // -------------------------------------------------------------------------
  // Core services
  // -------------------------------------------------------------------------

  const cliService = new CliService(context, outputChannel);
  const mcpManager = new McpClientManager(context, outputChannel);
  const contextProvider = new ContextProvider(context);
  const snapshotProvider = ToddSnapshotProvider.register(context);
  const terminalService = new AgentTerminalService();
  let chatViewProvider!: ChatViewProvider;
  const editTracker = new AgentEditTracker(snapshotProvider, (sessionId, edits) => {
    chatViewProvider?.notifyLiveEdits(sessionId, edits);
  });

  // Start IPC daemon, then run lightweight workspace bootstrap in a separate process.
  // (never run Kiro download / setup inside the daemon — it would block stdout IPC).
  void (async () => {
    try {
      await cliService.start();
      const workspace = vscode.workspace.workspaceFolders?.[0];
      const args = ['-q', '--skip-kiro'];
      if (workspace) {
        args.push(workspace.uri.fsPath);
      }
      const result = await cliService.runCommand('setup', args);
      if (result.stderr) {
        outputChannel.info(result.stderr.trim());
      }
      outputChannel.info('Todd bootstrap complete (workspace + AI-DLC).');
    } catch (err) {
      outputChannel.error(`CLI failed to start or bootstrap: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  // Connect MCP servers from workspace configuration
  mcpManager.connectFromConfig().catch((err: Error) => {
    outputChannel.warn(`MCP connection error: ${err.message}`);
  });

  // -------------------------------------------------------------------------
  // Webview providers
  // -------------------------------------------------------------------------

  chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    cliService,
    contextProvider,
    outputChannel,
    editTracker,
    terminalService,
  );

  const specManagerProvider = new SpecManagerProvider(
    context.extensionUri,
    cliService,
    chatViewProvider,
    contextProvider,
    outputChannel,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.VIEW_ID,
      chatViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      SpecManagerProvider.VIEW_ID,
      specManagerProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  context.subscriptions.push(
    // Add file/folder to context
    vscode.commands.registerCommand('toddspect.addToContext', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showWarningMessage('No file or folder selected.');
        return;
      }
      await contextProvider.add(target);
      void vscode.window.showInformationMessage(
        `Added to Todd context: ${path.basename(target.fsPath)}`,
      );
      chatViewProvider.notifyContextChanged();
    }),

    // Remove file/folder from context
    vscode.commands.registerCommand('toddspect.removeFromContext', async (uri?: vscode.Uri) => {
      if (!uri) {
        return;
      }
      contextProvider.remove(uri.fsPath);
      chatViewProvider.notifyContextChanged();
    }),

    // Clear chat + context (view title toolbar — same as in-webview "Clear all")
    vscode.commands.registerCommand('toddspect.clearContext', () => {
      chatViewProvider.clearChatAndContext();
    }),

    vscode.commands.registerCommand('toddspect.revertAgentChanges', () => {
      void chatViewProvider.revertAgentChanges();
    }),

    // Show current context items
    vscode.commands.registerCommand('toddspect.showContext', () => {
      const items = contextProvider.getItems();
      if (items.length === 0) {
        void vscode.window.showInformationMessage('Todd context is empty.');
        return;
      }
      const labels = items.map((item) => item.label).join('\n• ');
      void vscode.window.showInformationMessage(`Context items:\n• ${labels}`);
    }),

    // Run agent via Quick Pick
    vscode.commands.registerCommand('toddspect.runAgent', async () => {
      const agentItems: vscode.QuickPickItem[] = [
        { label: '$(sparkle) Auto (Todd picks)', description: 'auto' },
        { label: '$(copilot) GitHub Copilot', description: 'copilot' },
        { label: '$(robot) Devin', description: 'devin' },
        { label: '$(sparkle) Cursor AI', description: 'cursor' },
        { label: '$(hubot) Claude Code', description: 'claude' },
        { label: '$(cloud) AWS KIRO', description: 'kiro' },
      ];

      const chosen = await vscode.window.showQuickPick(agentItems, {
        title: 'Todd — Select Agent',
        placeHolder: 'Choose an agent to run',
      });

      if (!chosen?.description) {
        return;
      }

      const agentId = chosen.description as AgentSelectionId;
      const prompt = await vscode.window.showInputBox({
        title: `Run ${chosen.label} Agent`,
        prompt: 'Enter your prompt',
        placeHolder: 'e.g. Refactor the auth module for SOLID compliance',
      });

      if (!prompt) {
        return;
      }

      await chatViewProvider.sendChatMessage(prompt, agentId);
      // Reveal the chat view
      await vscode.commands.executeCommand('toddspect.chatView.focus');
    }),

    // Open configuration panel
    vscode.commands.registerCommand('toddspect.openConfig', () => {
      ConfigurationPanel.createOrShow(context.extensionUri, context, cliService);
    }),

    vscode.commands.registerCommand('toddspect.openUserManual', () => {
      UserManualPanel.createOrShow(context.extensionUri);
    }),

    // Diagnose setup (runs CLI `check getGoat` with extension secrets/env)
    vscode.commands.registerCommand('toddspect.setup', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      try {
        await cliService.start();
        const result = await cliService.runCommand('setup', workspaceFolder ? [workspaceFolder.uri.fsPath] : []);
        const channel = vscode.window.createOutputChannel('Todd Setup');
        channel.clear();
        channel.appendLine(result.stdout || result.stderr || 'Setup finished.');
        channel.show();
        if (result.success) {
          void vscode.window.showInformationMessage('Todd setup complete (Kiro CLI + AI-DLC).');
          } else {
          void vscode.window.showWarningMessage('Todd setup finished with warnings. See Output → Todd Setup.');
        }
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Setup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),

    vscode.commands.registerCommand('toddspect.aidlcInstall', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        void vscode.window.showErrorMessage('Open a workspace folder first.');
        return;
      }
      try {
        await cliService.start();
        const msg = await cliService.send({
          id: crypto.randomUUID(),
          action: 'aidlc:install',
          payload: { workspaceRoot: workspaceFolder.uri.fsPath },
        });
        if (msg.error) {
          void vscode.window.showErrorMessage(`AI-DLC install failed: ${msg.error}`);
          return;
        }
        const result = msg.payload as { created?: string[]; version?: string };
        void vscode.window.showInformationMessage(
          `AI-DLC v${result.version ?? '?'} installed. Use: "Using AI-DLC, …" in chat with Kiro.`,
        );
      } catch (err) {
        void vscode.window.showErrorMessage(
          `AI-DLC install failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),

    vscode.commands.registerCommand('toddspect.check.getGoat', async () => {
      const result = await cliService.runCommand('check', ['getGoat']);
      const channel = vscode.window.createOutputChannel('Todd getGoat');
      channel.clear();
      channel.appendLine(result.stderr || result.stdout || 'getGoat completed.');
      channel.show();
      if (!result.success) {
        const action = await vscode.window.showWarningMessage(
          'Todd getGoat: no agents ready. See Output → Todd getGoat.',
          'Login GitHub Copilot',
        );
        if (action === 'Login GitHub Copilot') {
          await vscode.commands.executeCommand('toddspect.copilotLogin');
        }
      } else {
        void vscode.window.showInformationMessage('Todd getGoat: at least one agent is ready.');
      }
    }),

    // Login GitHub Copilot via gh auth login (terminal) or token input box
    vscode.commands.registerCommand('toddspect.copilotLogin', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          {
            label: '$(terminal) Use GitHub CLI (gh auth login)',
            description: 'Opens a terminal. Run `gh auth login`, then reload VS Code.',
            detail: 'Recommended — no token to copy/paste',
            id: 'gh',
          },
          {
            label: '$(key) Paste token manually',
            description: 'Enter a GitHub OAuth token (gho_… or github_pat_…)',
            detail: 'Use this when `gh` CLI is not installed',
            id: 'paste',
          },
        ],
        {
          title: 'GitHub Copilot — Authentication',
          placeHolder: 'How would you like to authenticate?',
        },
      );

      if (!choice) {
        return;
      }

      if (choice.id === 'gh') {
        const terminal = vscode.window.createTerminal({ name: 'Todd: gh auth login' });
        terminal.show();
        // gh auth refresh adds the copilot scope to existing auth without re-login.
        // Falls back to full login if not yet authenticated.
        terminal.sendText('gh auth refresh --scopes copilot || gh auth login --web --scopes copilot');
        void vscode.window.showInformationMessage(
          'Complete the GitHub login in the terminal, then reload VS Code to apply the new token.',
          'Reload Window',
        ).then((action) => {
          if (action === 'Reload Window') {
            void vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
        return;
      }

      // Manual paste
      const token = await vscode.window.showInputBox({
        title: 'GitHub Copilot Token',
        prompt: 'Paste your GitHub OAuth token (starts with gho_ or github_pat_)',
        password: true,
        validateInput: (v) => {
          if (!v) {
            return 'Token cannot be empty';
          }
          if (v.startsWith('ghp_')) {
            return 'Classic PATs (ghp_) are not accepted by Copilot. Use gh auth login to get an OAuth token.';
          }
          if (!v.startsWith('gho_') && !v.startsWith('github_pat_')) {
            return 'Token should start with gho_ or github_pat_';
          }
          return null;
        },
      });

      if (!token) {
        return;
      }

      await context.secrets.store('toddspect.connectors.copilot.token', token);
      void vscode.window.showInformationMessage(
        'GitHub Copilot token saved. Restarting Todd daemon...',
      );
      cliService.dispose();
      void cliService.start().then(() => {
        void vscode.window.showInformationMessage('Todd daemon restarted with new token.');
      });
    }),

    // Initialize workspace .toddspect/ directory
    vscode.commands.registerCommand('toddspect.initWorkspace', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        void vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Todd: Initializing workspace...',
          cancellable: false,
        },
        async () => cliService.runCommand('init', [workspaceFolder.uri.fsPath]),
      );

      if (result.success) {
        void vscode.window.showInformationMessage(
          'Todd workspace initialized! `.toddspect/` directory created.',
        );
      } else {
        void vscode.window.showErrorMessage(`Initialization failed: ${result.stderr}`);
      }
    }),

    // Create new Spec
    vscode.commands.registerCommand('toddspect.newSpec', async () => {
      specManagerProvider.createNewSpec();
    }),
  );

  // -------------------------------------------------------------------------
  // Dispose all services on deactivation
  // -------------------------------------------------------------------------

  context.subscriptions.push(
    { dispose: () => cliService.dispose() },
    { dispose: () => mcpManager.dispose() },
    outputChannel,
  );

  outputChannel.info('Todd extension activated.');
}

export function deactivate(): void {
  // Cleanup is handled via context.subscriptions above
}
