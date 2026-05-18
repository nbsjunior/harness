import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ContextItem, ContextItemKind } from '../types';

const CONTEXT_STATE_KEY = 'harness.contextItems';

/**
 * Manages the set of files and directories included in the current agent context.
 * State is persisted to workspaceState so it survives extension reloads.
 */
export class ContextProvider {
  private items = new Map<string, ContextItem>();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadPersistedState();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async add(uri: vscode.Uri): Promise<void> {
    const uriString = uri.toString();
    if (this.items.has(uriString)) {
      return;
    }

    const stat = await vscode.workspace.fs.stat(uri);
    const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;

    const item: ContextItem = {
      uri: uriString,
      kind: isDirectory ? 'directory' : this.inferKind(uri),
      label: this.labelFor(uri),
      tokenEstimate: isDirectory
        ? await this.estimateDirectoryTokens(uri)
        : await this.estimateFileTokens(uri),
    };

    this.items.set(uriString, item);
    await this.persistState();
  }

  remove(uriString: string): void {
    this.items.delete(uriString);
    void this.persistState();
  }

  clear(): void {
    this.items.clear();
    void this.persistState();
  }

  getItems(): ContextItem[] {
    return Array.from(this.items.values());
  }

  has(uriString: string): boolean {
    return this.items.has(uriString);
  }

  getTotalTokenEstimate(): number {
    let total = 0;
    for (const item of this.items.values()) {
      total += item.tokenEstimate ?? 0;
    }
    return total;
  }

  /**
   * Expand all context items to a flat list of file contents.
   * Used to serialize context before sending to the CLI.
   */
  async buildContextPayload(): Promise<Array<{ path: string; content: string }>> {
    const result: Array<{ path: string; content: string }> = [];

    for (const item of this.items.values()) {
      const uri = vscode.Uri.parse(item.uri);

      if (item.kind === 'directory') {
        const files = await this.collectFilesInDirectory(uri, 3);
        for (const fileUri of files) {
          try {
            const content = await this.readFileContent(fileUri);
            result.push({ path: fileUri.fsPath, content });
          } catch {
            // Skip unreadable files silently
          }
        }
      } else {
        try {
          const content = await this.readFileContent(uri);
          result.push({ path: uri.fsPath, content });
        } catch {
          // Skip
        }
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private inferKind(uri: vscode.Uri): ContextItemKind {
    const ext = path.extname(uri.fsPath).toLowerCase();
    const textExtensions = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
      '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.swift', '.kt',
      '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml',
      '.html', '.css', '.scss', '.sql', '.sh', '.bash', '.zsh',
    ]);
    return textExtensions.has(ext) ? 'file' : 'file';
  }

  private labelFor(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    }
    return path.basename(uri.fsPath);
  }

  private async estimateFileTokens(uri: vscode.Uri): Promise<number> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      // Rough approximation: 1 token ≈ 4 characters
      return Math.ceil(bytes.length / 4);
    } catch {
      return 0;
    }
  }

  private async estimateDirectoryTokens(uri: vscode.Uri): Promise<number> {
    try {
      const files = await this.collectFilesInDirectory(uri, 2);
      let total = 0;
      for (const f of files.slice(0, 50)) {
        total += await this.estimateFileTokens(f);
      }
      return total;
    } catch {
      return 0;
    }
  }

  private async collectFilesInDirectory(
    uri: vscode.Uri,
    maxDepth: number,
    currentDepth = 0,
  ): Promise<vscode.Uri[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const result: vscode.Uri[] = [];

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(uri);
    } catch {
      return [];
    }

    for (const [name, type] of entries) {
      if (name.startsWith('.') || name === 'node_modules' || name === 'dist') {
        continue;
      }

      const childUri = vscode.Uri.joinPath(uri, name);

      if (type === vscode.FileType.Directory) {
        const children = await this.collectFilesInDirectory(childUri, maxDepth, currentDepth + 1);
        result.push(...children);
      } else if (type === vscode.FileType.File) {
        result.push(childUri);
      }
    }

    return result;
  }

  private async readFileContent(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
  }

  private loadPersistedState(): void {
    const persisted = this.context.workspaceState.get<ContextItem[]>(CONTEXT_STATE_KEY, []);
    for (const item of persisted) {
      // Verify the file still exists before restoring
      try {
        const fsPath = vscode.Uri.parse(item.uri).fsPath;
        if (fs.existsSync(fsPath)) {
          this.items.set(item.uri, item);
        }
      } catch {
        // Skip invalid URIs
      }
    }
  }

  private async persistState(): Promise<void> {
    await this.context.workspaceState.update(
      CONTEXT_STATE_KEY,
      Array.from(this.items.values()),
    );
  }
}
