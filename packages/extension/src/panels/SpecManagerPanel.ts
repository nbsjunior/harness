import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type {
  SpecDefinition,
  SddStepId,
  SddWorkflowStatus,
  WebviewMessage,
  ExtensionMessage,
} from '../types';
import type { CliService } from '../services/CliService';
import type { ChatViewProvider } from '../providers/ChatViewProvider';
import type { ContextProvider } from '../providers/ContextProvider';

/**
 * Webview panel for SDD: Todd specs (.toddspect/specs) + spec-kit workflow (.toddspect/sdd).
 */
export class SpecManagerProvider implements vscode.WebviewViewProvider {
  static readonly VIEW_ID = 'toddspect.specView';

  private view?: vscode.WebviewView;
  private specs: SpecDefinition[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly cliService: CliService,
    private readonly chatViewProvider: ChatViewProvider,
    private readonly contextProvider: ContextProvider,
    private readonly output: vscode.LogOutputChannel,
  ) {}

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
      void this.handleMessage(msg);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.loadAndSendSpecs();
        void this.loadAndSendSddWorkflow();
      }
    });

    void this.loadAndSendSpecs();
    void this.loadAndSendSddWorkflow();
  }

  createNewSpec(): void {
    this.post({ command: 'specSaved', payload: { action: 'new' } });
    this.view?.show(true);
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.command) {
      case 'ready':
        await this.loadAndSendSpecs();
        await this.loadAndSendSddWorkflow();
        break;

      case 'loadSpecs':
        await this.loadAndSendSpecs();
        break;

      case 'loadSddWorkflow':
        await this.loadAndSendSddWorkflow(
          (msg.payload as { activeFeatureId?: string | null })?.activeFeatureId,
        );
        break;

      case 'initSddWorkflow':
        await this.initSddWorkflow();
        break;

      case 'createSddFeature':
        await this.createSddFeature(msg.payload as { name: string; description?: string });
        break;

      case 'writeSddArtifact': {
        const p = msg.payload as { stepId: SddStepId; featureId: string | null };
        await this.writeSddArtifact(p.stepId, p.featureId);
        break;
      }

      case 'runSddStep': {
        const p = msg.payload as {
          stepId: SddStepId;
          featureId: string | null;
          userNotes?: string;
        };
        await this.runSddStep(p.stepId, p.featureId, p.userNotes);
        break;
      }

      case 'selectSddFeature':
        await this.loadAndSendSddWorkflow(
          (msg.payload as { featureId: string | null }).featureId,
        );
        break;

      case 'openSddFile': {
        const filePath = (msg.payload as { filePath: string }).filePath;
        await this.openSddFile(filePath);
        break;
      }

      case 'discoverSpecsRepo':
        await this.discoverSpecsRepo();
        break;

      case 'saveSpec': {
        const spec = msg.payload as SpecDefinition;
        await this.saveSpec(spec);
        break;
      }

      case 'deleteSpec': {
        const payload = msg.payload as { filePath: string };
        await this.deleteSpec(payload.filePath);
        break;
      }

      case 'openConfig':
        await vscode.commands.executeCommand('toddspect.openConfig');
        break;

      default:
        this.output.warn(`SpecManagerPanel: unknown command "${msg.command}"`);
    }
  }

  private async loadAndSendSddWorkflow(activeFeatureId?: string | null): Promise<void> {
    try {
      const result = await this.cliService.send<
        { activeFeatureId?: string | null },
        SddWorkflowStatus
      >({
        id: crypto.randomUUID(),
        action: 'sdd:workflow:status',
        payload: { activeFeatureId: activeFeatureId ?? undefined },
      }, { expectResponse: 'sdd:workflow:status:result', timeoutMs: 15_000 });

      this.post({
        command: 'sddWorkflowLoaded',
        payload: { status: result.payload },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.post({ command: 'error', payload: `SDD workflow: ${msg}` });
    }
  }

  private async initSddWorkflow(): Promise<void> {
    try {
      const result = await this.cliService.send<
        Record<string, never>,
        { status: SddWorkflowStatus; created: string[]; sddRoot: string }
      >({
        id: crypto.randomUUID(),
        action: 'sdd:workflow:init',
        payload: {},
      }, { expectResponse: 'sdd:workflow:init:result', timeoutMs: 15_000 });

      void vscode.window.showInformationMessage(
        `SDD workspace initialized (${result.payload.created.length} item(s)).`,
      );
      this.post({
        command: 'sddWorkflowUpdated',
        payload: { status: result.payload.status },
      });
    } catch (err) {
      void vscode.window.showErrorMessage(
        `SDD init failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async createSddFeature(payload: { name: string; description?: string }): Promise<void> {
    try {
      const result = await this.cliService.send<
        { name: string; description?: string },
        { featureId: string; status: SddWorkflowStatus }
      >({
        id: crypto.randomUUID(),
        action: 'sdd:workflow:createFeature',
        payload,
      }, { expectResponse: 'sdd:workflow:createFeature:result', timeoutMs: 15_000 });

      void vscode.window.showInformationMessage(`Feature created: ${result.payload.featureId}`);
      this.post({
        command: 'sddWorkflowUpdated',
        payload: { status: result.payload.status },
      });
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Create feature failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async writeSddArtifact(stepId: SddStepId, featureId: string | null): Promise<void> {
    try {
      const result = await this.cliService.send<
        { stepId: SddStepId; featureId: string | null },
        { path: string; created: boolean; status: SddWorkflowStatus }
      >({
        id: crypto.randomUUID(),
        action: 'sdd:workflow:writeArtifact',
        payload: { stepId, featureId },
      }, { expectResponse: 'sdd:workflow:writeArtifact:result', timeoutMs: 15_000 });

      const doc = await vscode.workspace.openTextDocument(result.payload.path);
      await vscode.window.showTextDocument(doc, { preview: false });
      this.post({
        command: 'sddWorkflowUpdated',
        payload: { status: result.payload.status },
      });
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Scaffold failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async runSddStep(
    stepId: SddStepId,
    featureId: string | null,
    userNotes?: string,
  ): Promise<void> {
    try {
      const result = await this.cliService.send<
        { stepId: SddStepId; featureId: string | null; userNotes?: string },
        { prompt: string; contextPaths: string[]; mode: 'spec+agent' }
      >({
        id: crypto.randomUUID(),
        action: 'sdd:workflow:stepPrompt',
        payload: { stepId, featureId, userNotes },
      }, { expectResponse: 'sdd:workflow:stepPrompt:result', timeoutMs: 15_000 });

      for (const p of result.payload.contextPaths) {
        try {
          await this.contextProvider.add(vscode.Uri.file(p));
        } catch {
          // skip invalid paths
        }
      }

      await this.chatViewProvider.sendChatMessage(
        result.payload.prompt,
        undefined,
        result.payload.mode,
      );
      await vscode.commands.executeCommand('toddspect.chatView.focus');
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Run step failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async openSddFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      void vscode.window.showWarningMessage('File does not exist yet. Create scaffold first.');
      return;
    }
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  private async discoverSpecsRepo(): Promise<void> {
    try {
      const result = await this.cliService.send<
        Record<string, never>,
        { suggestions: { suggestedFile: string; title: string }[] }
      >({
        id: crypto.randomUUID(),
        action: 'spec:discover',
        payload: {},
      }, { expectResponse: 'spec:discover:result', timeoutMs: 20_000 });

      const n = result.payload.suggestions?.length ?? 0;
      void vscode.window.showInformationMessage(
        `Spec discovery: ${n} suggestion(s). Run \`toddspect spec:discover --write\` to materialize.`,
      );
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async loadAndSendSpecs(): Promise<void> {
    try {
      this.specs = await this.scanSpecFiles();
      this.post({ command: 'specsLoaded', payload: this.specs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.error(`Failed to load specs: ${msg}`);
      this.post({ command: 'error', payload: `Failed to load specs: ${msg}` });
    }
  }

  private async scanSpecFiles(): Promise<SpecDefinition[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const specsDir = vscode.workspace
      .getConfiguration('toddspect')
      .get<string>('specsDirectory', '.toddspect/specs');

    const specsDirPath = path.join(workspaceFolder.uri.fsPath, specsDir);

    if (!fs.existsSync(specsDirPath)) {
      return [];
    }

    const results: SpecDefinition[] = [];

    try {
      const result = await this.cliService.send<{ path: string }, { specs: SpecDefinition[] }>({
        id: crypto.randomUUID(),
        action: 'spec:parse',
        payload: { path: specsDirPath },
      });
      results.push(...(result.payload.specs ?? []));
    } catch {
      const files = fs
        .readdirSync(specsDirPath)
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.md'));

      for (const file of files) {
        results.push({
          kind: 'Skill',
          name: path.basename(file, path.extname(file)),
          description: '',
          filePath: path.join(specsDirPath, file),
        });
      }
    }

    return results;
  }

  private async saveSpec(spec: SpecDefinition): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    const specsDir = vscode.workspace
      .getConfiguration('toddspect')
      .get<string>('specsDirectory', '.toddspect/specs');

    const specsDirPath = path.join(workspaceFolder.uri.fsPath, specsDir);

    if (!fs.existsSync(specsDirPath)) {
      fs.mkdirSync(specsDirPath, { recursive: true });
    }

    const fileName = `${spec.kind.toLowerCase()}-${spec.name.toLowerCase().replace(/\s+/g, '-')}.yaml`;
    const filePath = spec.filePath ?? path.join(specsDirPath, fileName);

    const yaml = this.specToYaml(spec);
    fs.writeFileSync(filePath, yaml, 'utf-8');

    void vscode.window.showInformationMessage(`Spec saved: ${path.basename(filePath)}`);
    await this.loadAndSendSpecs();
  }

  private async deleteSpec(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Delete spec: ${path.basename(filePath)}?`,
      { modal: true },
      'Delete',
    );

    if (confirm !== 'Delete') {
      return;
    }

    fs.unlinkSync(filePath);
    await this.loadAndSendSpecs();
  }

  private specToYaml(spec: SpecDefinition): string {
    const lines: string[] = [
      `kind: ${spec.kind}`,
      `name: ${spec.name}`,
      `description: "${spec.description.replace(/"/g, '\\"')}"`,
    ];

    if (spec.tools && spec.tools.length > 0) {
      lines.push('tools:');
      for (const tool of spec.tools) {
        lines.push(`  - name: ${tool.name}`);
        lines.push(`    description: "${tool.description.replace(/"/g, '\\"')}"`);
      }
    }

    if (spec.agents) {
      lines.push('agents:');
      lines.push(`  preferred: ${spec.agents.preferred}`);
      if (spec.agents.fallback) {
        lines.push(`  fallback: ${spec.agents.fallback}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  private post(msg: ExtensionMessage): void {
    void this.view?.webview.postMessage(msg);
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'spec', 'main.js'),
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
  <title>Todd SDD</title>
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
