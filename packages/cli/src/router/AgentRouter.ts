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
import type {
  ChatMessage,
  ChatToolEventPayload,
  ContextItem,
  AgentId,
  AgentSelectionId,
  CopilotMode,
} from '../types.js';
import { resolveProviderModel } from '../models/providerModels.js';
import type { AgentConnectorConfig } from '../config.js';
import { buildCopilotAuthHeaders, validateCopilotToken, getCopilotApiToken } from '../connectors/copilotAuth.js';
import { runKiroCli } from '../connectors/kiroCli.js';
import { ensureAidlcInstalled } from '../aidlc/install.js';
import { ensureKiroCli } from '../kiro/bootstrap.js';
import { buildKiroPrompt } from '../aidlc/prompt.js';
import { checkAgentReadiness } from './agentReadiness.js';
import { isChatSessionCancelled } from '../session/cancel.js';
import { harnessLog } from '../log.js';
import { routeCursorCloud } from '../connectors/cursorCloud.js';
import {
  isAutoSelection,
  resolveAutoAgent,
  type AutoRouteResult,
} from './autoRouter.js';

export interface AgentRequest {
  sessionId: string;
  messages: ChatMessage[];
  context: ContextItem[];
  agent: AgentSelectionId;
  /** Interaction mode: ask | agent | spec+agent */
  mode?: CopilotMode;
  /** Active spec files (for Auto scoring in spec+agent mode). */
  specCount?: number;
  config: AgentConnectorConfig;
  /** Provider model id from UI (`auto` = default). */
  model?: string;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  /** Called when `agent` is `auto` and a concrete provider was chosen. */
  onAutoRouted?: (result: AutoRouteResult) => void;
  /** File/tool events for live diff + integrated terminal in the extension. */
  onToolEvent?: (event: Omit<ChatToolEventPayload, 'sessionId'>) => void;
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
    let agent: AgentId;

    if (isAutoSelection(request.agent)) {
      const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
      const auto = resolveAutoAgent({
        prompt: lastUser?.content ?? '',
        mode: request.mode ?? 'ask',
        contextCount: request.context.length,
        specCount: request.specCount ?? 0,
        config: request.config,
      });
      agent = auto.agent;
      harnessLog(
        `[auto] rule=${auto.ruleId} → ${agent} fallback=${auto.fallbackUsed} scores=${JSON.stringify(auto.scores)}`,
      );
      request.onAutoRouted?.(auto);
    } else {
      agent = request.agent;
    }

    const readiness = checkAgentReadiness(agent, request.config);
    if (!readiness.ready) {
      request.onError(
        `${readiness.label}: ${readiness.hint}`,
      );
      return;
    }

    const routed = { ...request, model: request.model };

    switch (agent) {
      case 'copilot':
        await this.routeCopilot(routed, agent);
        break;
      case 'devin':
        await this.routeDevin(routed);
        break;
      case 'cursor':
        await this.routeCursor(routed, agent);
        break;
      case 'claude':
        await this.routeClaude(routed, agent);
        break;
      case 'kiro':
        await this.routeKiro(routed);
        break;
      default: {
        const _exhaustive: never = agent;
        request.onError(`Unknown agent: ${String(_exhaustive)}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GitHub Copilot — OpenAI-compatible SSE streaming
  // ---------------------------------------------------------------------------

  private async resolveCopilotApiToken(cfg: AgentConnectorConfig['copilot']): Promise<string | null> {
    if (!cfg.token) {
      return null;
    }
    const tokenError = validateCopilotToken(cfg.token);
    if (tokenError) {
      return null;
    }
    try {
      return await getCopilotApiToken(cfg.token);
    } catch {
      return cfg.token;
    }
  }

  /**
   * Local workspace agent: Copilot tool loop (read/write/search/git) against HARNESS_WORKSPACE.
   * Used for Copilot Agent mode and for Cursor/Devin Agent mode when cloud APIs cannot edit the IDE.
   */
  private async routeLocalWorkspaceAgent(req: AgentRequest): Promise<void> {
    const cfg = req.config.copilot;
    const copilotToken = await this.resolveCopilotApiToken(cfg);
    if (!copilotToken) {
      req.onError(
        'Local Agent mode needs GitHub Copilot configured (`gh auth login` or Harness → Copilot). ' +
          'It reads and writes files in your VS Code workspace.',
      );
      return;
    }

    const mode = req.mode ?? 'agent';
    const messages = this.buildOpenAiMessages(req.messages, mode);
    const url = new URL('/chat/completions', cfg.endpoint);
    const model = this.copilotModel(req, 'copilot');
    await this.routeCopilotAgent(url, copilotToken, messages, req, model);
  }

  private copilotModel(req: AgentRequest, agent: AgentId): string | undefined {
    return resolveProviderModel(agent, req.model);
  }

  private async routeCopilot(req: AgentRequest, agent: AgentId): Promise<void> {
    const cfg = req.config.copilot;
    if (!cfg.token) {
      req.onError(
        'GitHub Copilot token not configured. Run `gh auth login`, set GH_TOKEN, ' +
          'or save a fine-grained PAT (github_pat_…) via Harness configuration.',
      );
      return;
    }

    const copilotToken = await this.resolveCopilotApiToken(cfg);
    if (!copilotToken) {
      req.onError(validateCopilotToken(cfg.token) ?? 'Invalid Copilot token.');
      return;
    }

    const mode = req.mode ?? 'ask';
    const messages = this.buildOpenAiMessages(req.messages, mode);
    const url = new URL('/chat/completions', cfg.endpoint);

    const model = this.copilotModel(req, agent);

    if (mode === 'agent' || mode === 'spec+agent') {
      await this.routeCopilotAgent(url, copilotToken, messages, req, model);
    } else {
      const body = JSON.stringify({
        model: model ?? 'gpt-4o',
        stream: true,
        messages,
      });
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
    model?: string,
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
        model: model ?? 'gpt-4o',
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
        const msg = (err as Error).message;
        if (/429|quota exceeded/i.test(msg)) {
          req.onError(
            'GitHub Copilot quota exceeded (HTTP 429). Wait and retry, pick another model, ' +
              'or use provider **Cursor** / **Claude** for Ask mode. ' +
              'Local workspace Agent mode requires Copilot when provider is **Copilot**.',
          );
        } else {
          req.onError(`Copilot agent request failed: ${msg}`);
        }
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
          {
            sessionId: req.sessionId,
            onToolEvent: req.onToolEvent,
          },
        );
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
        const toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, string>;
        req.onChunk(formatToolResultChunk(toolCall.function.name, toolArgs, result) + '\n');
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
  // Cursor AI — Cloud Agents API v1 (https://api.cursor.com)
  // ---------------------------------------------------------------------------

  private async routeCursor(req: AgentRequest, _agent: AgentId): Promise<void> {
    const cfg = req.config.cursor;
    const mode = req.mode ?? 'ask';

    // Cursor provider always uses Cursor Cloud API (never GitHub Copilot).
    // Local workspace file edits (Agent tool loop) are only available with provider **Copilot**.
    if (mode === 'agent' || mode === 'spec+agent') {
      req.onChunk(
        '**[Harness of AI]** Cursor **Agent** runs on **Cursor Cloud** (api.cursor.com). ' +
          'To edit files directly in this VS Code workspace, choose provider **Copilot** with Agent mode.\n\n',
      );
    }

    await routeCursorCloud({
      sessionId: req.sessionId,
      messages: req.messages,
      context: req.context,
      mode: req.mode,
      apiKey: cfg.apiKey,
      endpoint: cfg.endpoint,
      onChunk: req.onChunk,
      onDone: req.onDone,
      onError: req.onError,
    });
  }

  // ---------------------------------------------------------------------------
  // Claude Code — CLI subprocess with stream-json output
  // ---------------------------------------------------------------------------

  private async routeClaude(req: AgentRequest, agent: AgentId): Promise<void> {
    const cfg = req.config.claude;
    const claudeBin = cfg.path;

    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      req.onError('No user message found in conversation history.');
      return;
    }

    const args = ['-p', lastUser.content, '--output-format', 'stream-json', '--verbose'];
    const claudeModel = resolveProviderModel(agent, req.model);
    if (claudeModel) {
      args.push('--model', claudeModel);
    }

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
      const workspace = process.env['HARNESS_WORKSPACE']?.trim() || process.cwd();
      mapped.unshift({
        role: 'system',
        content:
          `You are an autonomous coding agent for the VS Code workspace at: ${workspace}. ` +
          `Use read_file, write_file, list_files, search_in_files, run_git, and run_gh tools. ` +
          `Context files are in <file> blocks in earlier system messages — read them before editing. ` +
          `Apply changes with write_file so the engineer sees them in the IDE. ` +
          (mode === 'spec+agent'
            ? `Active Harness Spec definitions are in <spec> blocks — follow them.`
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
import { execFileSync } from 'child_process';

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
    {
      type: 'function',
      function: {
        name: 'run_git',
        description:
          'Run a git command in the workspace root (e.g. status, diff, log, branch, add, commit). ' +
          'Do not pass destructive flags unless the user asked.',
        parameters: {
          type: 'object',
          properties: {
            args: {
              type: 'string',
              description: 'Git subcommand and arguments, e.g. "status" or "diff --staged".',
            },
          },
          required: ['args'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_gh',
        description:
          'Run GitHub CLI (gh) in the workspace, e.g. "pr list", "issue view 12", "repo view". Requires gh auth login.',
        parameters: {
          type: 'object',
          properties: {
            args: {
              type: 'string',
              description: 'gh subcommand and arguments, e.g. "pr create --title ...".',
            },
          },
          required: ['args'],
        },
      },
    },
  ];
}

/** Format tool output for chat UI — uses `path:line` so the webview can linkify file refs. */
function formatToolResultChunk(
  toolName: string,
  args: Record<string, string>,
  result: string,
): string {
  const workspace = process.env['HARNESS_WORKSPACE'] ?? process.cwd();
  const firstLine = result.split('\n')[0]?.trim() ?? '';

  if (toolName === 'read_file' || toolName === 'write_file') {
    const p = args['path'];
    if (p) {
      const display = p.replace(/\\/g, '/');
      const verb = toolName === 'write_file' ? 'Wrote' : 'Read';
      return `- ${verb} \`${display}\``;
    }
    const absMatch = result.match(/(?:Written |Error: file not found: )?([^\s(]+)/);
    if (absMatch?.[1]) {
      const rel = toWorkspaceRelPath(absMatch[1], workspace);
      const verb = toolName === 'write_file' ? 'Wrote' : 'Read';
      return `- ${verb} \`${rel}\``;
    }
  }

  if (toolName === 'search_in_files' && firstLine.includes(':')) {
    const m = firstLine.match(/^(.+?):(\d+):/);
    if (m?.[1] && m[2]) {
      const rel = toWorkspaceRelPath(m[1], workspace);
      return `- Match \`${rel}:${m[2]}\``;
    }
  }

  const preview = firstLine.slice(0, 100);
  return `- \`${toolName}\`: ${preview || 'ok'}`;
}

function toWorkspaceRelPath(abs: string, workspace: string): string {
  try {
    const rel = fsPath.relative(workspace, abs);
    if (rel && !rel.startsWith('..') && !fsPath.isAbsolute(rel)) {
      return rel.replace(/\\/g, '/');
    }
  } catch { /* keep absolute */ }
  return abs.replace(/\\/g, '/');
}

async function executeCopilotTool(
  name: string,
  argsJson: string,
  _context: ContextItem[],
  opts: {
    sessionId: string;
    onToolEvent?: (event: Omit<ChatToolEventPayload, 'sessionId'>) => void;
  },
): Promise<string> {
  const workspace = process.env['HARNESS_WORKSPACE'] ?? process.cwd();

  function resolvePath(p: string): string {
    if (fsPath.isAbsolute(p)) return p;
    return fsPath.resolve(workspace, p);
  }

  function runShellCommand(bin: string, args: string): string {
    const argv = args.trim().split(/\s+/).filter(Boolean);
    const output = execFileSync(bin, argv, {
      cwd: workspace,
      encoding: 'utf-8',
      maxBuffer: 512 * 1024,
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.trim() || '(no output)';
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
        const oldContent = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
        const newContent = args['content'] ?? '';
        opts.onToolEvent?.({
          tool: 'write_file',
          phase: 'before',
          path: abs,
          oldContent,
        });
        fs.mkdirSync(fsPath.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, newContent, 'utf-8');
        opts.onToolEvent?.({
          tool: 'write_file',
          phase: 'after',
          path: abs,
          preview: newContent.length > 400 ? `${newContent.slice(0, 400)}…` : newContent,
        });
        return `Written ${abs} (${newContent.length} bytes)`;
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

      case 'run_git': {
        const raw = (args['args'] ?? '').trim();
        if (!raw) return 'Error: git args required';
        const allowed = /^(status|diff|log|branch|add|commit|push|pull|fetch|checkout|stash|remote|show|rev-parse|merge|rebase)(\s|$)/;
        if (!allowed.test(raw)) {
          return `Error: git subcommand not allowed. Use: status, diff, log, branch, add, commit, push, pull, fetch, checkout, stash, remote, show, rev-parse, merge, rebase. Got: ${raw}`;
        }
        opts.onToolEvent?.({
          tool: 'run_git',
          phase: 'terminal',
          command: `git ${raw}`,
        });
        try {
          return runShellCommand('git', raw);
        } catch (err) {
          const e = err as { stdout?: string; stderr?: string; message?: string };
          return [e.stderr, e.stdout, e.message].filter(Boolean).join('\n').trim() || 'git failed';
        }
      }

      case 'run_gh': {
        const raw = (args['args'] ?? '').trim();
        if (!raw) return 'Error: gh args required';
        if (/[;&|`$]/.test(raw)) {
          return 'Error: invalid characters in gh args';
        }
        opts.onToolEvent?.({
          tool: 'run_gh',
          phase: 'terminal',
          command: `gh ${raw}`,
        });
        try {
          return runShellCommand('gh', raw);
        } catch (err) {
          const e = err as { stdout?: string; stderr?: string; message?: string };
          return [e.stderr, e.stdout, e.message].filter(Boolean).join('\n').trim() || 'gh failed';
        }
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool execution error: ${(err as Error).message}`;
  }
}
