import * as vscode from 'vscode';

const TERMINAL_NAME = 'Todd';

/**
 * Mirrors agent shell commands to the integrated terminal for debug visibility.
 */
export class AgentTerminalService {
  private terminal?: vscode.Terminal;

  show(commandLine: string): void {
    const cfg = vscode.workspace.getConfiguration('toddspect.agent');
    if (!cfg.get<boolean>('mirrorCommandsToTerminal', true)) {
      return;
    }

    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal({
        name: TERMINAL_NAME,
        iconPath: new vscode.ThemeIcon('terminal'),
      });
    }
    this.terminal.show(true);
    this.terminal.sendText(commandLine, true);
  }

  focus(): void {
    if (this.terminal) {
      this.terminal.show(true);
    } else {
      const t = vscode.window.createTerminal({ name: TERMINAL_NAME });
      this.terminal = t;
      t.show(true);
    }
  }
}
