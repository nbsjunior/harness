import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ChatToolEventPayload, LiveEditEntry } from '../types';
import { HarnessSnapshotProvider } from './HarnessSnapshotProvider';

interface FileCheckpoint {
  /** null = file did not exist before agent run */
  before: string | null;
  absPath: string;
}

interface SessionCheckpoint {
  files: Map<string, FileCheckpoint>;
  pendingRevert: boolean;
}

export type { LiveEditEntry };

/**
 * Tracks agent file mutations for live diff UI and revert (all providers using local tools).
 */
export class AgentEditTracker {
  private readonly sessions = new Map<string, SessionCheckpoint>();
  private readonly liveEdits = new Map<string, LiveEditEntry[]>();

  constructor(
    private readonly snapshots: HarnessSnapshotProvider,
    private readonly onLiveEdits: (sessionId: string, edits: LiveEditEntry[]) => void,
  ) {}

  beginSession(sessionId: string): void {
    this.sessions.set(sessionId, { files: new Map(), pendingRevert: true });
    this.liveEdits.set(sessionId, []);
    this.onLiveEdits(sessionId, []);
  }

  hasPendingRevert(sessionId: string): boolean {
    const s = this.sessions.get(sessionId);
    return !!s?.pendingRevert && s.files.size > 0;
  }

  async handleToolEvent(event: ChatToolEventPayload): Promise<void> {
    const session = this.sessions.get(event.sessionId);
    if (!session) {
      return;
    }

    const list = this.liveEdits.get(event.sessionId) ?? [];
    const entry: LiveEditEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tool: event.tool,
      path: event.path ?? event.command ?? '',
      phase: event.phase,
      preview: event.preview,
      timestamp: Date.now(),
    };
    list.push(entry);
    this.liveEdits.set(event.sessionId, list);
    this.onLiveEdits(event.sessionId, [...list]);

    if (event.phase === 'before' && event.path) {
      const abs = path.resolve(event.path);
      if (!session.files.has(abs)) {
        session.files.set(abs, {
          absPath: abs,
          before: event.oldContent ?? null,
        });
        if (event.oldContent !== undefined && event.oldContent !== null) {
          this.snapshots.setSnapshot(abs, event.oldContent);
        }
      }
    }

    if (event.phase === 'after' && event.path) {
      const abs = path.resolve(event.path);
      const cfg = vscode.workspace.getConfiguration('harness.agent');
      if (cfg.get<boolean>('showLiveDiff', true)) {
        await this.openDiff(abs, session);
      }
      const preview = event.preview ?? this.readPreview(abs);
      entry.preview = preview;
      this.onLiveEdits(event.sessionId, [...list]);

      if (cfg.get<boolean>('openChangedFiles', true)) {
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
          await vscode.window.showTextDocument(doc, {
            preview: true,
            preserveFocus: true,
            viewColumn: vscode.ViewColumn.Beside,
          });
        } catch {
          // ignore
        }
      }
    }
  }

  async revertSession(sessionId: string): Promise<{ restored: number; removed: number }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { restored: 0, removed: 0 };
    }

    let restored = 0;
    let removed = 0;

    for (const cp of session.files.values()) {
      if (cp.before === null) {
        if (fs.existsSync(cp.absPath)) {
          fs.unlinkSync(cp.absPath);
          removed++;
        }
      } else {
        fs.mkdirSync(path.dirname(cp.absPath), { recursive: true });
        fs.writeFileSync(cp.absPath, cp.before, 'utf-8');
        restored++;
      }
      this.snapshots.removeSnapshot(cp.absPath);
    }

    session.files.clear();
    session.pendingRevert = false;
    this.liveEdits.set(sessionId, []);
    this.onLiveEdits(sessionId, []);

    void vscode.window.showInformationMessage(
      `Harness of AI: reverted agent changes (${restored} restored, ${removed} new files removed).`,
    );

    return { restored, removed };
  }

  endSession(sessionId: string, keepRevert = true): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pendingRevert = keepRevert && session.files.size > 0;
    }
  }

  private readPreview(absPath: string, max = 400): string {
    try {
      const text = fs.readFileSync(absPath, 'utf-8');
      return text.length > max ? `${text.slice(0, max)}…` : text;
    } catch {
      return '';
    }
  }

  private async openDiff(absPath: string, session: SessionCheckpoint): Promise<void> {
    const cp = session.files.get(absPath);
    if (!cp || cp.before === null) {
      return;
    }
    const left = this.snapshots.setSnapshot(absPath, cp.before);
    const right = vscode.Uri.file(absPath);
    const title = `${path.basename(absPath)} (Harness — before ↔ after)`;
    await vscode.commands.executeCommand('vscode.diff', left, right, title);
  }
}
