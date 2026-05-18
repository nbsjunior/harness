import https from 'https';
import http from 'http';
import { URL } from 'url';
import { execa } from 'execa';
import type { ChatMessage, ContextItem, AgentId } from '../types.js';
import type { AgentConnectorConfig } from '../config.js';

export interface AgentRequest {
  sessionId: string;
  messages: ChatMessage[];
  context: ContextItem[];
  agent: AgentId;
  config: AgentConnectorConfig;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * Routes agent requests to the appropriate connector implementation.
 *
 * Each connector streams response chunks via `onChunk`, signals completion with
 * `onDone`, and signals failure with `onError`. Errors are always communicated
 * through `onError` — connectors never throw directly to the caller.
 *
 * Debug output goes to stderr; stdout is reserved for JSON IPC frames.
 */
export class AgentRouter {
  async route(request: AgentRequest): Promise<void> {
    switch (request.agent) {
      case 'copilot':
        await this.routeCopilot(request);
        break;
      case 'devin':
        await this.routeDevin(request);
        break;
      case 'cursor':
        await this.routeCursor(request);
        break;
      case 'claude':
        await this.routeClaude(request);
        break;
      case 'kiro':
        await this.routeKiro(request);
        break;
      default: {
        // Exhaustiveness check — TypeScript will error here if a new AgentId is added
        const _exhaustive: never = request.agent;
        request.onError(`Unknown agent: ${String(_exhaustive)}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GitHub Copilot — OpenAI-compatible SSE streaming
  // ---------------------------------------------------------------------------

  private async routeCopilot(req: AgentRequest): Promise<void> {
    const cfg = req.config.copilot;
    if (!cfg.token) {
      req.onError('GitHub Copilot token not configured. Set GITHUB_TOKEN or harness.connectors.copilot.token.');
      return;
    }

    const url = new URL('/chat/completions', cfg.endpoint);
    const body = JSON.stringify({
      model: 'gpt-4o',
      stream: true,
      messages: this.buildOpenAiMessages(req.messages),
    });

    await this.streamSseRequest(
      url,
      { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body,
      req.onChunk,
      req.onDone,
      req.onError,
    );
  }

  // ---------------------------------------------------------------------------
  // Devin — single-response REST API (async session)
  // ---------------------------------------------------------------------------

  private async routeDevin(req: AgentRequest): Promise<void> {
    const cfg = req.config.devin;
    if (!cfg.apiKey) {
      req.onError('Devin API key not configured. Set DEVIN_API_KEY or harness.connectors.devin.apiKey.');
      return;
    }

    const url = new URL('/sessions', cfg.endpoint);
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');

    const body = JSON.stringify({
      prompt: lastUser?.content ?? '',
      idempotent: false,
    });

    try {
      const text = await this.httpPost(url, cfg.apiKey, body);
      const data = JSON.parse(text) as { session_id?: string; url?: string };
      req.onChunk(`Devin session created: ${data.url ?? data.session_id ?? '(unknown)'}\n`);
      req.onChunk('Devin is working asynchronously. Visit the session URL for live progress.\n');
      req.onDone();
    } catch (err) {
      req.onError(`Devin request failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Cursor AI — OpenAI-compatible endpoint
  // ---------------------------------------------------------------------------

  private async routeCursor(req: AgentRequest): Promise<void> {
    const cfg = req.config.cursor;
    if (!cfg.endpoint) {
      req.onError('Cursor AI endpoint not configured. Set harness.connectors.cursor.endpoint.');
      return;
    }

    const url = new URL('/chat/completions', cfg.endpoint);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }

    const body = JSON.stringify({
      model: 'claude-3-5-sonnet',
      stream: true,
      messages: this.buildOpenAiMessages(req.messages),
    });

    await this.streamSseRequest(url, headers, body, req.onChunk, req.onDone, req.onError);
  }

  // ---------------------------------------------------------------------------
  // Claude Code — CLI subprocess with stream-json output
  // ---------------------------------------------------------------------------

  private async routeClaude(req: AgentRequest): Promise<void> {
    const cfg = req.config.claude;
    const claudeBin = cfg.path;

    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      req.onError('No user message found in conversation history.');
      return;
    }

    const args = ['-p', lastUser.content, '--output-format', 'stream-json', '--verbose'];

    if (cfg.apiKey) {
      process.env['ANTHROPIC_API_KEY'] = cfg.apiKey;
    }

    try {
      const subprocess = execa(claudeBin, args, { reject: false });

      subprocess.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          try {
            const event = JSON.parse(trimmed) as {
              type?: string;
              delta?: { text?: string };
              text?: string;
            };
            const content = event.type === 'assistant'
              ? (event.delta?.text ?? event.text ?? '')
              : '';
            if (content) {
              req.onChunk(content);
            }
          } catch {
            // Raw text line — pass through
            req.onChunk(text);
          }
        }
      });

      subprocess.stderr?.on('data', (chunk: Buffer) => {
        // Claude's stderr is its own debug output — forward to our stderr
        process.stderr.write(`[claude] ${chunk.toString('utf-8')}`);
      });

      const result = await subprocess;

      if (result.exitCode !== 0 && result.exitCode !== null) {
        req.onError(`Claude Code exited with code ${result.exitCode}`);
        return;
      }

      req.onDone();
    } catch (err) {
      req.onError(
        `Failed to run Claude Code CLI ("${claudeBin}"): ${(err as Error).message}. ` +
          'Is Claude Code installed and on PATH?',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // AWS KIRO — REST API
  // ---------------------------------------------------------------------------

  private async routeKiro(req: AgentRequest): Promise<void> {
    const cfg = req.config.kiro;
    if (!cfg.apiKey || !cfg.endpoint) {
      req.onError('AWS KIRO not configured. Set harness.connectors.kiro.apiKey and endpoint.');
      return;
    }

    const url = new URL('/invoke', cfg.endpoint);
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');

    const body = JSON.stringify({
      prompt: lastUser?.content ?? '',
      context: req.context.map((c) => ({ path: c.absolutePath, kind: c.kind, label: c.label })),
    });

    try {
      const text = await this.httpPost(url, cfg.apiKey, body);
      const data = JSON.parse(text) as { response?: string; output?: string };
      req.onChunk(data.response ?? data.output ?? text);
      req.onDone();
    } catch (err) {
      req.onError(`KIRO request failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Shared utilities
  // ---------------------------------------------------------------------------

  private buildOpenAiMessages(
    messages: ChatMessage[],
  ): Array<{ role: string; content: string }> {
    return messages
      .filter((m) => m.role !== 'system' || m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * Stream an OpenAI-compatible SSE chat completion.
   * Parses `data: {...}` lines, extracts `choices[0].delta.content` chunks.
   */
  private streamSseRequest(
    url: URL,
    headers: Record<string, string>,
    body: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const bodyBuffer = Buffer.from(body, 'utf-8');

      const req = lib.request(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Length': bodyBuffer.length },
      }, (res) => {
        if (res.statusCode !== undefined && res.statusCode >= 400) {
          const msg = `HTTP ${res.statusCode} from ${url.hostname}`;
          onError(msg);
          reject(new Error(msg));
          return;
        }

        let sseBuffer = '';

        res.on('data', (chunk: Buffer) => {
          sseBuffer += chunk.toString('utf-8');
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue;
            }
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content ?? '';
              if (content) {
                onChunk(content);
              }
            } catch {
              // Skip malformed SSE frames silently
            }
          }
        });

        res.on('end', () => { onDone(); resolve(); });
        res.on('error', (err: Error) => { onError(err.message); reject(err); });
      });

      req.on('error', (err: Error) => { onError(err.message); reject(err); });
      req.write(bodyBuffer);
      req.end();
    });
  }

  private httpPost(url: URL, apiKey: string, body: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const bodyBuffer = Buffer.from(body, 'utf-8');

      const req = lib.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuffer.length,
          Authorization: `Bearer ${apiKey}`,
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          } else {
            resolve(text);
          }
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(bodyBuffer);
      req.end();
    });
  }
}
