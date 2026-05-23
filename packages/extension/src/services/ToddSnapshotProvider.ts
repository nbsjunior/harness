import * as vscode from 'vscode';

const SCHEME = 'toddspect-snapshot';

/** In-memory snapshots for diff (before agent write). */
export class ToddSnapshotProvider implements vscode.TextDocumentContentProvider {
  private readonly snapshots = new Map<string, string>();

  static register(context: vscode.ExtensionContext): ToddSnapshotProvider {
    const provider = new ToddSnapshotProvider();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
    );
    return provider;
  }

  setSnapshot(absPath: string, content: string): vscode.Uri {
    const key = absPath.replace(/\\/g, '/');
    this.snapshots.set(key, content);
    return vscode.Uri.parse(`${SCHEME}:${key}`);
  }

  removeSnapshot(absPath: string): void {
    this.snapshots.delete(absPath.replace(/\\/g, '/'));
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const key = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
    return this.snapshots.get(decodeURIComponent(key)) ?? '';
  }
}
