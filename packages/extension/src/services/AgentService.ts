import * as vscode from 'vscode';
import type {
  AgentSelectionId,
  ChatAutoRoutedPayload,
  ChatMessage,
  ChatSendPayload,
  ChatChunkPayload,
  CopilotMode,
  IPCMessage,
} from '../types';
import type { CliService } from './CliService';
import { traceLog } from '../trace';

interface ActiveChat {
  sessionId: string;
  disposables: vscode.Disposable[];
}

/**
 * @module services/AgentService
 * High-level chat API for the extension host.
 */
export class AgentService {
  private readonly activeChats = new Map<string, ActiveChat>();

  constructor(
    private readonly cliService: CliService,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  async chat(options: {
    sessionId: string;
    messages: ChatMessage[];
    contextPaths: string[];
    agent: AgentSelectionId;
    mode?: CopilotMode;
    specPaths?: string[];
    onChunk: (chunk: string, messageId: string) => void;
    onComplete: (messageId: string) => void;
    onError: (error: string, messageId: string) => void;
    onAutoRouted?: (route: ChatAutoRoutedPayload) => void;
    onStopped?: () => void;
  }): Promise<void> {
    const {
      sessionId,
      messages,
      contextPaths,
      agent,
      mode,
      specPaths,
      onChunk,
      onComplete,
      onError,
      onAutoRouted,
      onStopped,
    } = options;

    if (this.activeChats.has(sessionId)) {
      this.output.warn(`Session ${sessionId} is already active — ignoring duplicate request`);
      return;
    }

    const messageId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    traceLog(this.output, 'chat', 'send', {
      sessionId,
      agent,
      mode: mode ?? 'ask',
      contextFiles: contextPaths.length,
      specFiles: specPaths?.length ?? 0,
      messages: messages.length,
    });

    const chunkDisposable = this.cliService.onCliMessage('chat:chunk', (msg: IPCMessage) => {
      const p = msg.payload as ChatChunkPayload;
      if (p.sessionId !== sessionId) {
        return;
      }
      if (p.chunk) {
        onChunk(p.chunk, p.messageId);
      }
      if (p.done) {
        this.teardownSession(sessionId);
        traceLog(this.output, 'chat', 'complete', { sessionId });
        onComplete(p.messageId);
      }
    });

    const autoDisposable = this.cliService.onCliMessage('chat:auto-routed', (msg: IPCMessage) => {
      const p = msg.payload as ChatAutoRoutedPayload;
      if (p.sessionId !== sessionId) {
        return;
      }
      traceLog(this.output, 'chat', 'auto-routed', {
        sessionId,
        agent: p.agent,
        ruleId: p.ruleId,
        fallback: p.fallbackUsed,
      });
      onAutoRouted?.(p);
    });

    const errorDisposable = this.cliService.onCliMessage('chat:error', (msg: IPCMessage) => {
      const payload = msg.payload as { sessionId?: string; error?: string };
      if (payload.sessionId !== sessionId && msg.id !== requestId) {
        return;
      }
      this.teardownSession(sessionId);
      const errText = msg.error ?? payload.error ?? 'Unknown CLI error';
      traceLog(this.output, 'chat', 'error', { sessionId, error: errText });
      onError(errText, messageId);
    });

    this.activeChats.set(sessionId, {
      sessionId,
      disposables: [chunkDisposable, autoDisposable, errorDisposable],
    });

    try {
      const specsDir = vscode.workspace
        .getConfiguration('harness')
        .get<string>('specsDirectory', '.harness/specs');

      const payload: ChatSendPayload = {
        sessionId,
        messages,
        contextPaths,
        agent,
        specsDir,
        mode: mode ?? 'ask',
        specPaths: specPaths ?? [],
      };

      await this.cliService.send<ChatSendPayload>(
        {
          id: requestId,
          action: 'chat:send',
          payload,
        },
        { expectResponse: 'chat:send:ack', timeoutMs: 120_000 },
      );

      traceLog(this.output, 'chat', 'ack received', { sessionId });
    } catch (err) {
      this.teardownSession(sessionId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      traceLog(this.output, 'chat', 'send failed', { sessionId, error: errorMsg });
      onError(errorMsg, messageId);
    }
  }

  /** Stop listening for chunks and notify CLI to abort the session. */
  cancelSession(sessionId: string, onStopped?: () => void): void {
    traceLog(this.output, 'chat', 'cancel', { sessionId });
    this.teardownSession(sessionId);
    void this.cliService
      .send<{ sessionId: string }>(
        {
          id: crypto.randomUUID(),
          action: 'chat:cancel',
          payload: { sessionId },
        },
        { expectResponse: 'chat:cancel', timeoutMs: 5_000 },
      )
      .catch((err: Error) => {
        this.output.warn(`chat:cancel failed: ${err.message}`);
      });
    onStopped?.();
  }

  private teardownSession(sessionId: string): void {
    const active = this.activeChats.get(sessionId);
    if (active) {
      for (const d of active.disposables) {
        d.dispose();
      }
      this.activeChats.delete(sessionId);
    }
  }
}
