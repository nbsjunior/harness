import * as vscode from 'vscode';
import type {
  AgentId,
  ChatMessage,
  ChatSendPayload,
  ChatChunkPayload,
  ChatErrorPayload,
  ContextItem,
  IpcMessage,
} from '../types';
import type { CliService } from './CliService';

/**
 * High-level service that orchestrates agent calls through the CLI service.
 * Emits streaming chunks and completion events to registered callbacks.
 */
export class AgentService {
  private activeSessions = new Set<string>();

  constructor(
    private readonly cliService: CliService,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  /**
   * Send a chat request to the specified agent through the CLI orchestrator.
   * Calls `onChunk` incrementally as the CLI streams response chunks,
   * and calls `onComplete`/`onError` when done.
   */
  async chat(options: {
    sessionId: string;
    messages: ChatMessage[];
    context: ContextItem[];
    agent: AgentId;
    onChunk: (chunk: string, messageId: string) => void;
    onComplete: (messageId: string) => void;
    onError: (error: string, messageId: string) => void;
  }): Promise<void> {
    const { sessionId, messages, context, agent, onChunk, onComplete, onError } = options;

    if (this.activeSessions.has(sessionId)) {
      this.output.warn(`Session ${sessionId} is already active — ignoring duplicate request`);
      return;
    }

    this.activeSessions.add(sessionId);

    const messageId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    // Register streaming chunk listener before sending
    const chunkDisposable = this.cliService.onCliMessage('chat:chunk', (msg: IpcMessage) => {
      const payload = msg.payload as ChatChunkPayload;
      if (payload.sessionId !== sessionId) {
        return;
      }
      onChunk(payload.chunk, payload.messageId);
      if (payload.done) {
        chunkDisposable.dispose();
        errorDisposable.dispose();
        this.activeSessions.delete(sessionId);
        onComplete(payload.messageId);
      }
    });

    const errorDisposable = this.cliService.onCliMessage('chat:error', (msg: IpcMessage) => {
      const payload = msg.payload as ChatErrorPayload;
      if (payload.sessionId !== sessionId) {
        return;
      }
      chunkDisposable.dispose();
      errorDisposable.dispose();
      this.activeSessions.delete(sessionId);
      onError(payload.error, payload.messageId);
    });

    try {
      const specsDir = vscode.workspace
        .getConfiguration('harness')
        .get<string>('specsDirectory', '.harness/specs');

      const payload: ChatSendPayload = {
        sessionId,
        messages,
        context,
        agent,
        specsDir,
      };

      await this.cliService.send<ChatSendPayload>({
        id: requestId,
        type: 'chat:send',
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
