import * as vscode from 'vscode';
import * as path from 'path';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { SpecManagerProvider } from './panels/SpecManagerPanel';
import { ConfigurationPanel } from './panels/ConfigurationPanel';
import { ContextProvider } from './providers/ContextProvider';
import { CliService } from './services/CliService';
import { McpClientManager } from './mcp/McpClientManager';
import type { AgentId } from './types';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('Harness', { log: true });
  outputChannel.info('Harness extension activating...');

  // -------------------------------------------------------------------------
  // Core services
  // -------------------------------------------------------------------------

  const cliService = new CliService(context, outputChannel);
  const mcpManager = new McpClientManager(context, outputChannel);
  const contextProvider = new ContextProvider(context);

  // Start CLI subprocess immediately (non-blocking — it will re-try on first use if it fails)
  cliService.start().catch((err: Error) => {
    outputChannel.error(`CLI failed to start: ${err.message}`);
  });

  // Connect MCP servers from workspace configuration
  mcpManager.connectFromConfig().catch((err: Error) => {
    outputChannel.warn(`MCP connection error: ${err.message}`);
  });

  // -------------------------------------------------------------------------
  // Webview providers
  // -------------------------------------------------------------------------

  const chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    cliService,
    contextProvider,
    outputChannel,
  );

  const specManagerProvider = new SpecManagerProvider(
    context.extensionUri,
    cliService,
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
    vscode.commands.registerCommand('harness.addToContext', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showWarningMessage('No file or folder selected.');
        return;
      }
      await contextProvider.add(target);
      void vscode.window.showInformationMessage(
        `Added to Harness context: ${path.basename(target.fsPath)}`,
      );
      chatViewProvider.notifyContextChanged();
    }),

    // Remove file/folder from context
    vscode.commands.registerCommand('harness.removeFromContext', async (uri?: vscode.Uri) => {
      if (!uri) {
        return;
      }
      contextProvider.remove(uri.toString());
      chatViewProvider.notifyContextChanged();
    }),

    // Clear all context items
    vscode.commands.registerCommand('harness.clearContext', () => {
      contextProvider.clear();
      chatViewProvider.notifyContextChanged();
      void vscode.window.showInformationMessage('Harness context cleared.');
    }),

    // Show current context items
    vscode.commands.registerCommand('harness.showContext', () => {
      const items = contextProvider.getItems();
      if (items.length === 0) {
        void vscode.window.showInformationMessage('Harness context is empty.');
        return;
      }
      const labels = items.map((item) => item.label).join('\n• ');
      void vscode.window.showInformationMessage(`Context items:\n• ${labels}`);
    }),

    // Run agent via Quick Pick
    vscode.commands.registerCommand('harness.runAgent', async () => {
      const agentItems: vscode.QuickPickItem[] = [
        { label: '$(copilot) GitHub Copilot', description: 'copilot' },
        { label: '$(robot) Devin', description: 'devin' },
        { label: '$(sparkle) Cursor AI', description: 'cursor' },
        { label: '$(hubot) Claude Code', description: 'claude' },
        { label: '$(cloud) AWS KIRO', description: 'kiro' },
      ];

      const chosen = await vscode.window.showQuickPick(agentItems, {
        title: 'Harness — Select Agent',
        placeHolder: 'Choose an agent to run',
      });

      if (!chosen?.description) {
        return;
      }

      const agentId = chosen.description as AgentId;
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
      await vscode.commands.executeCommand('harness.chatView.focus');
    }),

    // Open configuration panel
    vscode.commands.registerCommand('harness.openConfig', () => {
      ConfigurationPanel.createOrShow(context.extensionUri, context);
    }),

    // Initialize workspace .harness/ directory
    vscode.commands.registerCommand('harness.initWorkspace', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        void vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      try {
        await cliService.send({
          id: crypto.randomUUID(),
          type: 'chat:send',
          payload: {
            sessionId: 'init',
            messages: [],
            context: [],
            agent: 'copilot',
          },
        });
      } catch {
        // Falls through to CLI direct call below
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Harness: Initializing workspace...',
          cancellable: false,
        },
        async () => cliService.runCommand('init', [workspaceFolder.uri.fsPath]),
      );

      if (result.success) {
        void vscode.window.showInformationMessage(
          'Harness workspace initialized! `.harness/` directory created.',
        );
      } else {
        void vscode.window.showErrorMessage(`Initialization failed: ${result.stderr}`);
      }
    }),

    // Create new Spec
    vscode.commands.registerCommand('harness.newSpec', async () => {
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

  outputChannel.info('Harness extension activated.');
}

export function deactivate(): void {
  // Cleanup is handled via context.subscriptions above
}
