/**
 * @module router/AgentRouter
 * Routes chat requests to external AI agents (Copilot, Devin, Cursor, Claude, Kiro).
 *
 * **Why:** One orchestration API (`route(AgentRequest)`) hides per-vendor protocols:
 * SSE streaming, REST sessions, CLI subprocesses, and Copilot tool-calling loops.
 *
 * **Copilot modes:**
 * - `ask` — SSE `chat/completions` with streaming
 * - `agent` / `spec+agent` — non-streaming tool loop (`read_file`, `write_file`, …), max 10 turns
 *
 * **Errors:** Always delivered via `onError` callback; never throw to IPC layer uncaught.
 *
 * @see docs/code-map.md — full method list
 * @see connectors/copilotAuth.ts — token exchange and headers
 */
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { execa } from 'execa';
import type { ChatMessage, ContextItem, AgentId, CopilotMode } from '../types.js';
import type { AgentConnectorConfig } from '../config.js';
import { buildCopilotAuthHeaders, validateCopilotToken, getCopilotApiToken } from '../connectors/copilotAuth.js';
import { runKiroCli } from '../connectors/kiroCli.js';
import { ensureAidlcInstalled } from '../aidlc/install.js';
import { ensureKiroCli } from '../kiro/bootstrap.js';
import { buildKiroPrompt } from '../aidlc/prompt.js';
import { checkAgentReadiness } from './agentReadiness.js';
import { isChatSessionCancelled } from '../session/cancel.js';
import { harnessLog } from '../log.js';

export interface AgentRequest {
  sessionId: string;
  messages: ChatMessage[];
  context: ContextItem[];
  agent: AgentId;
  /** Interaction mode: ask | agent | spec+agent */
  mode?: CopilotMode;
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
    const readiness = checkAgentReadiness(request.agent, request.config);
    if (!readiness.ready) {
      request.onError(readiness.hint);
      return;
    }

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
      req.onError(
        'GitHub Copilot token not configured. Run `gh auth login`, set GH_TOKEN, ' +
          'or save a fine-grained PAT (github_pat_…) via Harness configuration.',
      );
      return;
    }

    const tokenError = validateCopilotToken(cfg.token);
    if (tokenError) {
      req.onError(tokenError);
      return;
    }

    // Try to get a short-lived Copilot API token via the internal exchange endpoint.
    // If the token already has the `copilot` scope it can be used directly — the
    // exchange endpoint returns 404 for accounts without an individual Copilot plan.
    let copilotToken = cfg.token;
    try {
      copilotToken = await getCopilotApiToken(cfg.token);
    } catch {
      // Fall through: use the OAuth/PAT token directly (works when it has `copilot` scope)
    }

    const mode = req.mode ?? 'ask';
    const messages = this.buildOpenAiMessages(req.messages, mode);
    const url = new URL('/chat/completions', cfg.endpoint);

    if (mode === 'agent' || mode === 'spec+agent') {
      await this.routeCopilotAgent(url, copilotToken, messages, req);
    } else {
      // Ask mode — simple streaming chat completions
      const body = JSON.stringify({ model: 'gpt-4o', stream: true, messages });
      await this.streamSseRequest(
        url,
        { ...buildCopilotAuthHeaders(copilotToken), 'Content-Type': 'application/json' },
        body,
        req.onChunk,
        req.onDone,
        req.onError,
      );
    }
  }

  /**
   * Agent / Spec+Agent mode: function-calling loop.
   * Provides read_file, list_files, write_file, search tools and executes
   * them autonomously until the model returns finish_reason = "stop".
   */
  private async routeCopilotAgent(
    url: URL,
    copilotToken: string,
    messages: Array<Record<string, unknown>>,
    req: AgentRequest,
  ): Promise<void> {
    const tools = buildCopilotTools();
    const maxIterations = 10;

    req.onChunk('**[Agent]** Starting autonomous run…\n\n');
    harnessLog(`[copilot-agent] session=${req.sessionId} start`);

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (isChatSessionCancelled(req.sessionId)) {
        req.onChunk('\n**[Agent]** Stopped by user.\n');
        req.onDone();
        return;
      }

      req.onChunk(`**[Agent]** Step ${iteration + 1}/${maxIterations}…\n`);
      harnessLog(`[copilot-agent] session=${req.sessionId} iteration=${iteration + 1}`);

      const bodyObj: Record<string, unknown> = {
        model: 'gpt-4o',
        stream: false,
        messages,
        tools,
        tool_choice: 'auto',
      };

      let responseText: string;
      try {
        responseText = await this.httpPostJson(
          url,
          buildCopilotAuthHeaders(copilotToken),
          JSON.stringify(bodyObj),
        );
      } catch (err) {
        req.onError(`Copilot agent request failed: ${(err as Error).message}`);
        return;
      }

      let parsed: CopilotChatResponse;
      try {
        parsed = JSON.parse(responseText) as CopilotChatResponse;
      } catch {
        req.onError(`Failed to parse Copilot response: ${responseText.slice(0, 300)}`);
        return;
      }

      const choice = parsed.choices?.[0];
      if (!choice) {
        req.onError('Copilot returned no choices.');
        return;
      }

      const assistantMsg = choice.message;

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const text = assistantMsg.content?.trim();
        if (text) {
          req.onChunk(text + (text.endsWith('\n') ? '' : '\n'));
        } else {
          req.onChunk('_Agent finished without a text response._\n');
        }
        req.onDone();
        return;
      }

      const toolNames = assistantMsg.tool_calls.map((t) => t.function.name).join(', ');
      req.onChunk(`**[Agent]** Tools: ${toolNames}\n\n`);
      harnessLog(`[copilot-agent] tools: ${toolNames}`);

      messages.push({
        role: 'assistant',
        content: assistantMsg.content ?? null,
        tool_calls: assistantMsg.tool_calls,
      });

      for (const toolCall of assistantMsg.tool_calls) {
        if (isChatSessionCancelled(req.sessionId)) {
          req.onChunk('\n**[Agent]** Stopped by user.\n');
          req.onDone();
          return;
        }
        const result = await executeCopilotTool(
          toolCall.function.name,
          toolCall.function.arguments,
          req.context,
        );
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
        req.onChunk(`- \`${toolCall.function.name}\`: ${result.split('\n')[0]?.slice(0, 120) ?? 'ok'}\n`);
      }
    }

    req.onError('Agent reached maximum iterations without completing the task.');
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
      messages: this.buildOpenAiMessages(req.messages, 'ask'),
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
  // Kiro + AI-DLC — kiro-cli headless (steering: .kiro/steering/aws-aidlc-rules)
  // @see https://github.com/awslabs/aidlc-workflows
  // ---------------------------------------------------------------------------

  private async routeKiro(req: AgentRequest): Promise<void> {
    const cfg = req.config.kiro;

    if (cfg.mode === 'rest' && cfg.endpoint) {
      await this.routeKiroRest(req);
      return;
    }

    const workspace = process.env['HARNESS_WORKSPACE'] ?? process.cwd();

    try {
      const kiro = await ensureKiroCli({ allowDownload: true });
      cfg.cliPath = kiro.cliPath;
    } catch (err) {
      req.onError((err as Error).message);
      return;
    }

    const aidlcOk = await ensureAidlcInstalled(workspace, cfg.aidlcAutoInstall);
    if (!aidlcOk) {
      req.onError(
        'AI-DLC rules not installed. Run `harness aidlc install` or enable harness.aidlc.autoInstall.',
      );
      return;
    }

    const prompt = buildKiroPrompt(req.messages, { forceAidlc: true });

    await runKiroCli({
      config: cfg,
      prompt,
      cwd: workspace,
      onChunk: req.onChunk,
      onDone: req.onDone,
      onError: req.onError,
    });
  }

  /** Legacy REST connector (optional). Prefer kiro-cli + AI-DLC steering. */
  private async routeKiroRest(req: AgentRequest): Promise<void> {
    const cfg = req.config.kiro;
    if (!cfg.apiKey || !cfg.endpoint) {
      req.onError('Kiro REST mode: set KIRO_API_KEY and harness.connectors.kiro.endpoint.');
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
      req.onError(`Kiro REST request failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Shared utilities
  // ---------------------------------------------------------------------------

  private buildOpenAiMessages(
    messages: ChatMessage[],
    mode: CopilotMode = 'ask',
  ): Array<Record<string, unknown>> {
    const mapped = messages
      .filter((m) => m.role !== 'system' || m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    // Inject mode-specific system prompt if there isn't one already
    const hasSystemPrompt = mapped.some(m => m.role === 'system');
    if (!hasSystemPrompt && (mode === 'agent' || mode === 'spec+agent')) {
      mapped.unshift({
        role: 'system',
        content:
          `You are an autonomous coding agent with full access to read and write files in the workspace. ` +
          `When the user describes a task, use the available tools to read relevant files first, ` +
          `then produce the changes needed. Always explain what you changed and why. ` +
          `For file edits, use write_file to apply the changes directly. ` +
          (mode === 'spec+agent'
            ? `Active Harness Spec definitions are provided as <spec> blocks in the system context — ` +
              `treat them as authoritative guidance for behaviour, tools, and constraints.`
            : ''),
      });
    }

    return mapped;
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
          resolve();
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
        res.on('error', (err: Error) => {
          onError(err.message);
          resolve();
        });
      });

      req.on('error', (err: Error) => {
        onError(err.message);
        resolve();
      });
      req.write(bodyBuffer);
      req.end();
    });
  }

  /** Non-streaming POST — returns full response body. Used for agent tool-call loop. */
  private httpPostJson(url: URL, headers: Record<string, string>, body: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const bodyBuffer = Buffer.from(body, 'utf-8');
      const req = lib.request(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': bodyBuffer.length,
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} from ${url.hostname}: ${text.slice(0, 300)}`));
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

// ---------------------------------------------------------------------------
// Copilot Agent tools
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as fsPath from 'path';

interface CopilotChatResponse {
  choices?: Array<{
    message: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
}

function buildCopilotTools(): unknown[] {
  return [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the full content of a file at the given path.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute or workspace-relative file path.' },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write (create or overwrite) a file with the given content.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute or workspace-relative file path.' },
            content: { type: 'string', description: 'Full file content to write.' },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_files',
        description: 'List files in a directory (non-recursive, first level only).',
        parameters: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Absolute or workspace-relative directory path.' },
          },
          required: ['directory'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_in_files',
        description: 'Search for a text pattern in files under a directory using ripgrep-style matching.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Search pattern (plain text or regex).' },
            directory: { type: 'string', description: 'Directory to search in.' },
          },
          required: ['pattern', 'directory'],
        },
      },
    },
  ];
}

async function executeCopilotTool(
  name: string,
  argsJson: string,
  context: ContextItem[],
): Promise<string> {
  const workspace = process.env['HARNESS_WORKSPACE'] ?? process.cwd();

  function resolvePath(p: string): string {
    if (fsPath.isAbsolute(p)) return p;
    // Try to resolve relative to a context item directory first
    const ctxDir = context[0]
      ? fsPath.dirname(context[0].absolutePath)
      : workspace;
    return fsPath.resolve(ctxDir, p);
  }

  try {
    const args = JSON.parse(argsJson) as Record<string, string>;

    switch (name) {
      case 'read_file': {
        const abs = resolvePath(args['path'] ?? '');
        if (!fs.existsSync(abs)) return `Error: file not found: ${abs}`;
        const content = fs.readFileSync(abs, 'utf-8');
        return content.length > 20_000
          ? content.slice(0, 20_000) + '\n[…truncated]'
          : content;
      }

      case 'write_file': {
        const abs = resolvePath(args['path'] ?? '');
        fs.mkdirSync(fsPath.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, args['content'] ?? '', 'utf-8');
        return `Written ${abs} (${(args['content'] ?? '').length} bytes)`;
      }

      case 'list_files': {
        const abs = resolvePath(args['directory'] ?? '.');
        if (!fs.existsSync(abs)) return `Error: directory not found: ${abs}`;
        const entries = fs.readdirSync(abs, { withFileTypes: true });
        return entries
          .map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`)
          .join('\n');
      }

      case 'search_in_files': {
        const abs = resolvePath(args['directory'] ?? '.');
        const pattern = args['pattern'] ?? '';
        const results: string[] = [];

        function walkSearch(dir: string, depth = 0): void {
          if (depth > 5) return;
          let entries: fs.Dirent[];
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
          catch { return; }
          for (const e of entries) {
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            const full = fsPath.join(dir, e.name);
            if (e.isDirectory()) {
              walkSearch(full, depth + 1);
            } else if (e.isFile()) {
              try {
                const content = fs.readFileSync(full, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, i) => {
                  if (line.includes(pattern)) {
                    results.push(`${full}:${i + 1}: ${line.trim()}`);
                  }
                });
              } catch { /* skip binary/unreadable */ }
            }
            if (results.length >= 50) return;
          }
        }

        walkSearch(abs);
        return results.length > 0
          ? results.join('\n')
          : `No matches for "${pattern}" in ${abs}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool execution error: ${(err as Error).message}`;
  }
}
