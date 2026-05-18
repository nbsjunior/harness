import https from 'https';
import http from 'http';
import { URL } from 'url';
import { execa } from 'execa';
import type { ChatMessage, ContextItem } from '../types.js';

export type AgentId = 'copilot' | 'devin' | 'cursor' | 'claude' | 'kiro';

export interface AgentConfig {
  copilot?: { token: string; endpoint: string };
  devin?: { apiKey: string; endpoint: string };
  cursor?: { apiKey: string; endpoint: string };
  claude?: { path: string; apiKey?: string };
  kiro?: { apiKey: string; endpoint: string };
}

export interface AgentRequest {
  sessionId: string;
  messages: ChatMessage[];
  context: ContextItem[];
  agent: AgentId;
  config: AgentConfig;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * Routes agent requests to the appropriate connector based on the AgentId.
 * Each connector implements streaming where supported, falling back to
 * single-shot responses when the provider does not support SSE/streams.
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
        const _exhaustive: never = request.agent;
        request.onError(`Unknown agent: ${String(_exhaustive)}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GitHub Copilot (OpenAI-compatible chat completions with SSE streaming)
  // ---------------------------------------------------------------------------

  private async routeCopilot(req: AgentRequest): Promise<void> {
    const cfg = req.config.copilot;
    if (!cfg?.token) {
      req.onError(
        'GitHub Copilot token not configured. Set harness.connectors.copilot.token in settings.',
      );
      return;
    }

    const endpoint = cfg.endpoint || 'https://api.githubcopilot.com';
    const url = new URL('/chat/completions', endpoint);

    const body = JSON.stringify({
      model: 'gpt-4o',
      stream: true,
      messages: this.buildOpenAiMessages(req.messages, req.context),
    });

    await this.streamOpenAiRequest(
      url,
      { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body,
      req.onChunk,
      req.onDone,
      req.onError,
    );
  }

  // ---------------------------------------------------------------------------
  // Devin (REST API — single response, no streaming)
  // ---------------------------------------------------------------------------

  private async routeDevin(req: AgentRequest): Promise<void> {
    const cfg = req.config.devin;
    if (!cfg?.apiKey) {
      req.onError(
        'Devin API key not configured. Set harness.connectors.devin.apiKey in settings.',
      );
      return;
    }

    const endpoint = cfg.endpoint || 'https://api.devin.ai/v1';
    const url = new URL('/sessions', endpoint);

    const contextSummary = req.context
      .map((c) => `- ${c.label} (${c.kind})`)
      .join('\n');

    const lastUserMessage = [...req.messages].reverse().find((m) => m.role === 'user');
    const prompt = [
      contextSummary ? `Context:\n${contextSummary}\n` : '',
      lastUserMessage?.content ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    const body = JSON.stringify({
      prompt,
      idempotent: false,
    });

    try {
      const responseText = await this.httpPost(url, cfg.apiKey, body);
      const data = JSON.parse(responseText) as { session_id: string; url: string };

      req.onChunk(`Devin session created: ${data.url ?? data.session_id}\n`);
      req.onChunk(
        'Devin is working asynchronously. Check the session URL for live progress.\n',
      );
      req.onDone();
    } catch (err) {
      req.onError(err instanceof Error ? err.message : String(err));
    }
  }

  // ---------------------------------------------------------------------------
  // Cursor AI (OpenAI-compatible endpoint or MCP)
  // ---------------------------------------------------------------------------

  private async routeCursor(req: AgentRequest): Promise<void> {
    const cfg = req.config.cursor;
    if (!cfg?.endpoint) {
      req.onError(
        'Cursor AI endpoint not configured. Set harness.connectors.cursor.endpoint in settings.',
      );
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
      messages: this.buildOpenAiMessages(req.messages, req.context),
    });

    await this.streamOpenAiRequest(url, headers, body, req.onChunk, req.onDone, req.onError);
  }

  // ---------------------------------------------------------------------------
  // Claude Code (CLI subprocess with streaming stdout)
  // ---------------------------------------------------------------------------

  private async routeClaude(req: AgentRequest): Promise<void> {
    const cfg = req.config.claude;
    const claudePath = cfg?.path ?? 'claude';

    const lastUserMessage = [...req.messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) {
      req.onError('No user message found in conversation history.');
      return;
    }

    const contextFiles = req.context
      .filter((c) => c.kind === 'file')
      .map((c) => {
        try {
          return new URL(c.uri).pathname;
        } catch {
          return c.uri;
        }
      });

    const args = [
      '-p',
      lastUserMessage.content,
      '--output-format',
      'stream-json',
      '--verbose',
    ];

    // Add context files if Claude Code supports --file flag
    if (contextFiles.length > 0) {
      for (const f of contextFiles) {
        args.push('--file', f);
      }
    }

    if (cfg?.apiKey) {
      process.env['ANTHROPIC_API_KEY'] = cfg.apiKey;
    }

    try {
      const subprocess = execa(claudePath, args, {
        reject: false,
        all: false,
      });

      subprocess.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');

        // Stream-json format: each line is a JSON event
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          try {
            const event = JSON.parse(trimmed) as { type?: string; delta?: { text?: string }; text?: string };
            const content =
              event.type === 'assistant'
                ? (event.delta?.text ?? event.text ?? '')
                : '';
            if (content) {
              req.onChunk(content);
            }
          } catch {
            // Raw text output — emit directly
            req.onChunk(text);
          }
        }
      });

      subprocess.stderr?.on('data', (chunk: Buffer) => {
        const msg = chunk.toString('utf-8');
        if (msg.toLowerCase().includes('error')) {
          req.onError(`Claude Code error: ${msg}`);
        }
      });

      await subprocess;
      req.onDone();
    } catch (err) {
      req.onError(
        `Failed to run Claude Code CLI ("${claudePath}"): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // AWS KIRO (REST API)
  // ---------------------------------------------------------------------------

  private async routeKiro(req: AgentRequest): Promise<void> {
    const cfg = req.config.kiro;
    if (!cfg?.apiKey || !cfg?.endpoint) {
      req.onError(
        'AWS KIRO not configured. Set harness.connectors.kiro.apiKey and endpoint in settings.',
      );
      return;
    }

    const url = new URL('/invoke', cfg.endpoint);

    const lastUserMessage = [...req.messages].reverse().find((m) => m.role === 'user');

    const body = JSON.stringify({
      prompt: lastUserMessage?.content ?? '',
      context: req.context.map((c) => ({ uri: c.uri, kind: c.kind, label: c.label })),
    });

    try {
      const responseText = await this.httpPost(url, cfg.apiKey, body);
      const data = JSON.parse(responseText) as { response?: string; output?: string };
      const text = data.response ?? data.output ?? responseText;
      req.onChunk(text);
      req.onDone();
    } catch (err) {
      req.onError(err instanceof Error ? err.message : String(err));
    }
  }

  // ---------------------------------------------------------------------------
  // Shared utilities
  // ---------------------------------------------------------------------------

  private buildOpenAiMessages(
    messages: ChatMessage[],
    context: ContextItem[],
  ): Array<{ role: string; content: string }> {
    const result: Array<{ role: string; content: string }> = [];

    if (context.length > 0) {
      const contextBlock = context
        .map((c) => `<context kind="${c.kind}" path="${c.label}">${c.uri}</context>`)
        .join('\n');
      result.push({
        role: 'system',
        content: `You are a software engineering AI agent. The user has included the following context:\n\n${contextBlock}`,
      });
    }

    for (const msg of messages) {
      if (msg.role !== 'system') {
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }

  /**
   * Stream an OpenAI-compatible SSE chat completion response.
   */
  private streamOpenAiRequest(
    url: URL,
    headers: Record<string, string>,
    body: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;

      const req = lib.request(
        url,
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            const err = `HTTP ${res.statusCode} from ${url.hostname}`;
            onError(err);
            reject(new Error(err));
            return;
          }

          let buffer = '';

          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf-8');
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

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
                // Skip malformed SSE frames
              }
            }
          });

          res.on('end', () => {
            onDone();
            resolve();
          });

          res.on('error', (err: Error) => {
            onError(err.message);
            reject(err);
          });
        },
      );

      req.on('error', (err: Error) => {
        onError(err.message);
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }

  private httpPost(url: URL, apiKey: string, body: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;

      const req = lib.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            Authorization: `Bearer ${apiKey}`,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf-8');
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${text}`));
            } else {
              resolve(text);
            }
          });
          res.on('error', reject);
        },
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
