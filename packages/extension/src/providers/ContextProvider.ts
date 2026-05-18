import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ContextItem, ContextItemKind } from '../types';

const CONTEXT_STATE_KEY = 'harness.contextItems';

/**
 * Manages the set of files and directories included in the current agent context.
 *
 * Key invariant: every `ContextItem.absolutePath` is a resolved, absolute
 * file-system path. The CLI uses these directly for `fs.readFile` — no URI
 * decoding happens in the CLI layer.
 *
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
    const absolutePath = uri.fsPath;
    if (this.items.has(absolutePath)) {
      return;
    }

    const stat = await vscode.workspace.fs.stat(uri);
    const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;

    const item: ContextItem = {
      absolutePath,
      kind: isDirectory ? 'directory' : this.inferKind(uri),
      label: this.labelFor(uri),
      tokenEstimate: isDirectory
        ? await this.estimateDirectoryTokens(uri)
        : await this.estimateFileTokens(uri),
    };

    this.items.set(absolutePath, item);
    await this.persistState();
  }

  /** @param absolutePath resolved fs path (not a URI string) */
  remove(absolutePath: string): void {
    this.items.delete(absolutePath);
    void this.persistState();
  }

  clear(): void {
    this.items.clear();
    void this.persistState();
  }

  getItems(): ContextItem[] {
    return Array.from(this.items.values());
  }

  /** Returns absolute paths for all context items — passed directly to the CLI. */
  getAbsolutePaths(): string[] {
    return Array.from(this.items.keys());
  }

  has(absolutePath: string): boolean {
    return this.items.has(absolutePath);
  }

  getTotalTokenEstimate(): number {
    let total = 0;
    for (const item of this.items.values()) {
      total += item.tokenEstimate ?? 0;
    }
    return total;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private inferKind(_uri: vscode.Uri): ContextItemKind {
    return 'file';
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
        result.push(...await this.collectFilesInDirectory(childUri, maxDepth, currentDepth + 1));
      } else if (type === vscode.FileType.File) {
        result.push(childUri);
      }
    }

    return result;
  }

  private loadPersistedState(): void {
    const persisted = this.context.workspaceState.get<ContextItem[]>(CONTEXT_STATE_KEY, []);
    for (const item of persisted) {
      if (fs.existsSync(item.absolutePath)) {
        this.items.set(item.absolutePath, item);
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
