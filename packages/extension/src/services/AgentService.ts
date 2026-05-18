import * as vscode from 'vscode';
import type {
  AgentId,
  ChatMessage,
  ChatSendPayload,
  ChatChunkPayload,
  CopilotMode,
  IPCMessage,
} from '../types';
import type { CliService } from './CliService';

/**
 * High-level service that orchestrates agent calls through the CLI service.
 *
 * The CLI daemon receives absolute paths (`contextPaths`) and is responsible
 * for all file-system I/O (reading file contents, scanning directories).
 * The Extension Host never reads file contents itself to keep the extension
 * host process lean and avoid blocking the UI thread.
 */
export class AgentService {
  private activeSessions = new Set<string>();

  constructor(
    private readonly cliService: CliService,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  /**
   * Send a chat request to the CLI daemon.
   *
   * @param options.contextPaths  Absolute file-system paths resolved by ContextProvider.
   *                              The CLI reads and injects their content into the prompt.
   */
  async chat(options: {
    sessionId: string;
    messages: ChatMessage[];
    contextPaths: string[];
    agent: AgentId;
    mode?: CopilotMode;
    specPaths?: string[];
    onChunk: (chunk: string, messageId: string) => void;
    onComplete: (messageId: string) => void;
    onError: (error: string, messageId: string) => void;
  }): Promise<void> {
    const { sessionId, messages, contextPaths, agent, mode, specPaths, onChunk, onComplete, onError } = options;

    if (this.activeSessions.has(sessionId)) {
      this.output.warn(`Session ${sessionId} is already active — ignoring duplicate request`);
      return;
    }

    this.activeSessions.add(sessionId);

    const messageId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    // Register streaming push-event listeners BEFORE sending the request
    const chunkDisposable = this.cliService.onCliMessage('chat:chunk', (msg: IPCMessage) => {
      const p = msg.payload as ChatChunkPayload;
      if (p.sessionId !== sessionId) {
        return;
      }
      onChunk(p.chunk, p.messageId);
      if (p.done) {
        chunkDisposable.dispose();
        errorDisposable.dispose();
        this.activeSessions.delete(sessionId);
        onComplete(p.messageId);
      }
    });

    const errorDisposable = this.cliService.onCliMessage('chat:error', (msg: IPCMessage) => {
      if ((msg.payload as { sessionId?: string }).sessionId !== sessionId && msg.id !== requestId) {
        return;
      }
      chunkDisposable.dispose();
      errorDisposable.dispose();
      this.activeSessions.delete(sessionId);
      onError(msg.error ?? 'Unknown CLI error', messageId);
    });

    try {
      const specsDir = vscode.workspace
        .getConfiguration('harness')
        .get<string>('specsDirectory', '.harness/specs');

      const payload: ChatSendPayload = {
        sessionId,
        messages,
        contextPaths,   // absolute paths — CLI does the file reading
        agent,
        specsDir,
        mode: mode ?? 'ask',
        specPaths: specPaths ?? [],
      };

      await this.cliService.send<ChatSendPayload>({
        id: requestId,
        action: 'chat:send',
        payload,
      });
    } catch (err) {
      chunkDisposable.dispose();
      errorDisposable.dispose();
      this.activeSessions.delete(sessionId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      onError(errorMsg, messageId);
    }
  }

  cancelSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }
}
