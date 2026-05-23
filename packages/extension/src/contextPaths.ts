import * as vscode from 'vscode';
import type { ContextProvider } from './providers/ContextProvider.js';
import { resolveToddSpectWorkspacePath } from './workspacePath.js';

/**
 * Paths sent to the CLI on each chat message: manual context chips plus
 * optional open editors and workspace root (settings under toddspect.context.*).
 */
export function buildContextPathsForChat(contextProvider: ContextProvider): string[] {
  const paths = new Set(contextProvider.getAbsolutePaths());
  const cfg = vscode.workspace.getConfiguration('toddspect.context');

  if (cfg.get<boolean>('includeOpenEditors', true)) {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.scheme === 'file' && !editor.document.isUntitled) {
        paths.add(editor.document.uri.fsPath);
      }
    }
  }

  const workspaceRoot = resolveToddSpectWorkspacePath();
  if (cfg.get<boolean>('includeWorkspaceRoot', true) && workspaceRoot) {
    paths.add(workspaceRoot);
  }

  return [...paths];
}
