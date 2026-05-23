/**
 * Resolve the ToddSpect workspace root (CLI TODDSPECT_WORKSPACE).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Order: `toddspect.defaultWorkspace` (if path exists) → first VS Code workspace folder.
 */
export function resolveToddSpectWorkspacePath(): string | undefined {
  const toddspect = vscode.workspace.getConfiguration('toddspect');
  const override = toddspect.get<string>('defaultWorkspace', '').trim();
  if (override) {
    const resolved = path.resolve(override);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
