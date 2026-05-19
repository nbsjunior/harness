/**
 * Resolve the Harness workspace root (CLI HARNESS_WORKSPACE).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Order: `harness.defaultWorkspace` (if path exists) → first VS Code workspace folder.
 */
export function resolveHarnessWorkspacePath(): string | undefined {
  const harness = vscode.workspace.getConfiguration('harness');
  const override = harness.get<string>('defaultWorkspace', '').trim();
  if (override) {
    const resolved = path.resolve(override);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
