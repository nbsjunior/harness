/**
 * @module ipc/IpcServer
 * CLI daemon entry when launched with `--ipc`.
 *
 * **Why this module exists:** The VS Code extension must not perform file I/O or HTTP;
 * it spawns the CLI and exchanges newline-delimited JSON on stdin/stdout. This module
 * is the only code path that should write JSON to stdout in daemon mode.
 *
 * **Responsibilities:**
 * - Parse incoming frames and dispatch by `action`
 * - Enrich `chat:send` with file context and (for spec+agent) spec YAML as system messages
 * - Delegate agent work to `AgentRouter`
 * - Stream `chat:chunk` push events until `done: true`
 *
 * **Invariants:** Never `console.log` to stdout. Never `process.exit(0)` on stdin `end` (Windows).
 *
 * @see docs/ipc-protocol.md
 * @see docs/ai-reference.md
 */
import * as fs from 'fs';
import { AgentRouter } from '../router/AgentRouter.js';
import { parseSpecDirectory } from '../parsers/specParser.js';
import { contextBuildCommand } from '../commands/contextBuild.js';
import { getWorkspaceRoot, loadAgentConfig, loadPromptSettings, loadSpendingBudgetSettings } from '../config.js';
import {
  applyContextTruncation,
  optimizeMessagesForRouting,
} from '../prompt/systemGuidance.js';
import { estimateTokens, loadUsageStats, recordChatUsage, resetUsageStats } from '../usage/usageTracker.js';
import type { AgentId } from '../types.js';
import { installAidlcRules } from '../aidlc/install.js';
import { getAidlcStatus } from '../aidlc/status.js';
import {
  cancelChatSession,
  clearChatSessionCancel,
  isChatSessionCancelled,
} from '../session/cancel.js';
import { harnessLog } from '../log.js';
import { cancelCursorCloudSession } from '../connectors/cursorCloud.js';
import { cancelCursorLocalSession } from '../connectors/cursorLocal.js';
import {
  clearChatSession,
  loadChatSession,
  saveChatSession,
} from '../session/persistence.js';
import { evaluateBudgetAlerts } from '../usage/budget.js';
import { discoverSpecsFromRepo } from '../specs/discover.js';
import { formatFanoutMarkdown, runAgentFanout } from '../router/fanout.js';
import { loadPluginRegistry } from '../plugins/registry.js';
import type {
  IPCMessage,
  ChatSendPayload,
  ChatFanoutPayload,
  ContextBuildPayload,
  ContextResultPayload,
  SessionSavePayload,
  SpecParsePayload,
  SpecResultPayload,
} from '../types.js';

// ---------------------------------------------------------------------------
// Frame writer
// ---------------------------------------------------------------------------

/**
 * Write a single IPC message as a newline-delimited JSON frame to stdout.
 * stdout is ONLY for JSON frames. All debug output must go to stderr.
 */
function writeFrame(msg: IPCMessage): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

/**
 * Write an error response for a given request, using the envelope-level `error` field.
 */
function writeError(requestId: string, action: IPCMessage['action'], error: string): void {
  writeFrame({ id: requestId, action, payload: null, error });
}

// ---------------------------------------------------------------------------
// IPC server entry point
// ---------------------------------------------------------------------------

/**
 * Start the newline-delimited JSON IPC server on stdin/stdout.
 *
 * Protocol:
 *   - Extension writes `IPCMessage<T>` + `\n` to CLI stdin.
 *   - CLI writes `IPCMessage<T>` + `\n` to stdout (responses or push events).
 *   - CLI writes human-readable debug logs only to stderr.
 */
export async function startIpcServer(): Promise<void> {
  const router = new AgentRouter();

  // Signal readiness via stderr (never stdout — would break the JSON parser)
  process.stderr.write('[harness-cli] IPC daemon started — listening on stdin\n');

  let lineBuffer = '';

  process.stdin.setEncoding('utf-8');
  process.stdin.resume();

  process.stdin.on('data', (chunk: string) => {
    lineBuffer += chunk;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      parseAndDispatch(trimmed, router);
    }
  });

  process.stdin.on('end', () => {
    // Do not process.exit() — on Windows, stdin EOF can be spurious while the
    // extension host is still running, which caused "CLI daemon exited unexpectedly".
    process.stderr.write('[harness-cli] stdin end (daemon remains active until host disposes)\n');
  });

  process.stdin.on('error', (err: Error) => {
    process.stderr.write(`[harness-cli] stdin error: ${err.message}\n`);
    process.exit(1);
  });

  // Keep the process alive
  await new Promise<never>(() => { /* resolved by stdin end or fatal error */ });
}

// ---------------------------------------------------------------------------
// Frame dispatcher
// ---------------------------------------------------------------------------

function parseAndDispatch(raw: string, router: AgentRouter): void {
  let msg: IPCMessage;
  try {
    msg = JSON.parse(raw) as IPCMessage;
  } catch {
    process.stderr.write(`[harness-cli] Received non-JSON frame: ${raw.slice(0, 200)}\n`);
    return;
  }

  if (!msg.id || !msg.action) {
    process.stderr.write(`[harness-cli] Malformed frame (missing id/action)\n`);
    return;
  }

  void dispatchMessage(msg, router).catch((err: Error) => {
    process.stderr.write(`[harness-cli] Unhandled dispatch error for action=${msg.action}: ${err.message}\n`);
    writeError(msg.id, msg.action, err.message);
  });
}

async function dispatchMessage(msg: IPCMessage, router: AgentRouter): Promise<void> {
  switch (msg.action) {
    case 'ping':
      writeFrame({ id: msg.id, action: 'pong', payload: { ts: Date.now() } });
      break;

    case 'chat:send':
      await handleChatSend(msg as IPCMessage<ChatSendPayload>, router);
      break;

    case 'chat:cancel': {
      const { sessionId } = (msg.payload ?? {}) as { sessionId?: string };
      if (sessionId) {
        cancelChatSession(sessionId);
        const cursorCfg = loadAgentConfig().cursor;
        void cancelCursorLocalSession(sessionId);
        void cancelCursorCloudSession(
          sessionId,
          cursorCfg.apiKey,
          cursorCfg.endpoint,
        );
        harnessLog(`[ipc] chat:cancel sessionId=${sessionId}`);
      }
      writeFrame({ id: msg.id, action: 'chat:cancel', payload: { sessionId } });
      break;
    }

    case 'context:build':
      await handleContextBuild(msg as IPCMessage<ContextBuildPayload>);
      break;

    case 'spec:parse':
      await handleSpecParse(msg as IPCMessage<SpecParsePayload>);
      break;

    case 'agent:list':
      writeFrame({
        id: msg.id,
        action: 'agent:list:result',
        payload: { agents: ['copilot', 'devin', 'cursor', 'claude', 'kiro'] },
      });
      break;

    case 'aidlc:install':
      await handleAidlcInstall(msg);
      break;

    case 'aidlc:status':
      handleAidlcStatus(msg);
      break;

    case 'setup:bootstrap':
      await handleSetupBootstrap(msg);
      break;

    case 'usage:get': {
      const workspaceRoot = getWorkspaceRoot();
      const stats = loadUsageStats(workspaceRoot);
      const alerts = evaluateBudgetAlerts(stats, loadSpendingBudgetSettings());
      writeFrame({ id: msg.id, action: 'usage:stats', payload: { ...stats, alerts } });
      break;
    }

    case 'usage:reset': {
      const workspaceRoot = getWorkspaceRoot();
      const stats = resetUsageStats(workspaceRoot);
      const alerts = evaluateBudgetAlerts(stats, loadSpendingBudgetSettings());
      writeFrame({ id: msg.id, action: 'usage:reset:result', payload: { ...stats, alerts } });
      break;
    }

    case 'session:load': {
      const workspaceRoot = getWorkspaceRoot();
      const stored = loadChatSession(workspaceRoot);
      writeFrame({
        id: msg.id,
        action: 'session:loaded',
        payload: {
          session: stored
            ? {
                sessionId: stored.sessionId,
                selectedAgent: stored.selectedAgent,
                selectedMode: stored.selectedMode,
                model: stored.model,
                messages: stored.messages,
                contextPaths: stored.contextPaths,
                updatedAt: stored.updatedAt,
              }
            : null,
        },
      });
      break;
    }

    case 'session:save': {
      const p = msg.payload as SessionSavePayload;
      const workspaceRoot = getWorkspaceRoot();
      const saved = saveChatSession(
        {
          sessionId: p.sessionId,
          selectedAgent: p.selectedAgent,
          selectedMode: p.selectedMode,
          model: p.model,
          messages: p.messages,
          contextPaths: p.contextPaths,
        },
        workspaceRoot,
      );
      writeFrame({ id: msg.id, action: 'session:saved', payload: { ok: true, updatedAt: saved.updatedAt } });
      break;
    }

    case 'session:clear': {
      clearChatSession(getWorkspaceRoot());
      writeFrame({ id: msg.id, action: 'session:cleared', payload: { ok: true } });
      break;
    }

    case 'spec:discover': {
      const result = discoverSpecsFromRepo(getWorkspaceRoot());
      writeFrame({ id: msg.id, action: 'spec:discover:result', payload: result });
      break;
    }

    case 'chat:fanout':
      await handleChatFanout(msg as IPCMessage<ChatFanoutPayload>, router);
      break;

    case 'plugins:list': {
      const registry = loadPluginRegistry(getWorkspaceRoot());
      writeFrame({ id: msg.id, action: 'plugins:list:result', payload: registry });
      break;
    }

    default:
      process.stderr.write(`[harness-cli] Unknown action: ${msg.action}\n`);
      writeError(msg.id, msg.action as IPCMessage['action'], `Unknown action: ${msg.action}`);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleChatSend(
  msg: IPCMessage<ChatSendPayload>,
  router: AgentRouter,
): Promise<void> {
  const { sessionId, messages, contextPaths, agent, specsDir, mode, specPaths, model } =
    msg.payload;
  const agentConfig = loadAgentConfig(specsDir);
  const messageId = crypto.randomUUID();
  const workspaceRoot = getWorkspaceRoot();
  const promptSettings = loadPromptSettings();
  const startedAt = Date.now();
  let resolvedAgent: AgentId = agent === 'auto' ? 'copilot' : agent;
  let outputText = '';
  const inputText = messages.map((m) => m.content).join('\n');

  // Read context files from absolute paths (CLI owns all file I/O)
  let contextFiles = await readContextFiles(contextPaths);
  if (promptSettings.enabled) {
    contextFiles = applyContextTruncation(contextFiles, promptSettings.maxContextCharsPerFile);
  }

  let enrichedMessages = optimizeMessagesForRouting(messages, promptSettings, mode);
  if (contextFiles.length > 0) {
    const contextBlock = contextFiles
      .map(({ path, content }) => `<file path="${path}">\n${content}\n</file>`)
      .join('\n\n');

    enrichedMessages.unshift({
      id: crypto.randomUUID(),
      role: 'system',
      content:
        `Workspace: ${workspaceRoot}\n\n` +
        `The following project context is attached (files and/or folders scanned from the IDE):\n\n${contextBlock}`,
      timestamp: Date.now(),
    });
  }

  // For spec+agent mode: read and inject spec files as additional system context
  if (mode === 'spec+agent' && specPaths && specPaths.length > 0) {
    let specFiles = await readContextFiles(specPaths);
    if (promptSettings.enabled) {
      specFiles = applyContextTruncation(specFiles, promptSettings.maxContextCharsPerFile);
    }
    if (specFiles.length > 0) {
      const specBlock = specFiles
        .map(({ path, content }) => `<spec path="${path}">\n${content}\n</spec>`)
        .join('\n\n');

      enrichedMessages.unshift({
        id: crypto.randomUUID(),
        role: 'system',
        content:
          `The following Harness Spec definitions are active for this task. ` +
          `Follow them as authoritative guidance for agent behaviour, tools, and constraints:\n\n${specBlock}`,
        timestamp: Date.now(),
      });
    }
  }

  // Acknowledge immediately so the extension does not wait on the full agent run
  writeFrame({
    id: msg.id,
    action: 'chat:send:ack',
    payload: { sessionId, messageId },
  });

  harnessLog(
    `[ipc] chat:send agent=${agent} mode=${mode ?? 'ask'} context=${contextPaths.length} specs=${specPaths?.length ?? 0}`,
  );

  try {
    await router.route({
      sessionId,
      messages: enrichedMessages,
      context: contextPaths.map((p) => {
        let kind: 'file' | 'directory' = 'file';
        try {
          if (fs.statSync(p).isDirectory()) {
            kind = 'directory';
          }
        } catch {
          // keep file
        }
        return { absolutePath: p, kind, label: p };
      }),
      agent,
      mode: mode ?? 'ask',
      model,
      specCount: specPaths?.length ?? 0,
      config: agentConfig,
      onToolEvent: (event) => {
        writeFrame({
          id: msg.id,
          action: 'chat:tool',
          payload: { sessionId, ...event },
        });
      },
      onAutoRouted: (auto) => {
        resolvedAgent = auto.agent;
        writeFrame({
          id: msg.id,
          action: 'chat:auto-routed',
          payload: {
            sessionId,
            agent: auto.agent,
            ruleId: auto.ruleId,
            reason: auto.reason,
            fallbackUsed: auto.fallbackUsed,
            scores: auto.scores,
          },
        });
      },
      onChunk: (chunk) => {
        if (isChatSessionCancelled(sessionId)) {
          return;
        }
        outputText += chunk;
        writeFrame({
          id: msg.id,
          action: 'chat:chunk',
          payload: { sessionId, messageId, chunk, done: false },
        });
      },
      onDone: () => {
        clearChatSessionCancel(sessionId);
        emitUsageAndFinish(msg.id, {
          sessionId,
          agent: resolvedAgent,
          inputText,
          outputText,
          startedAt,
          mode: mode ?? 'ask',
          workspaceRoot,
        });
        writeFrame({
          id: msg.id,
          action: 'chat:chunk',
          payload: { sessionId, messageId, chunk: '', done: true },
        });
      },
      onError: (error) => {
        clearChatSessionCancel(sessionId);
        writeFrame({
          id: msg.id,
          action: 'chat:error',
          payload: { sessionId, error },
          error,
        });
      },
    });
  } catch (err) {
    clearChatSessionCancel(sessionId);
    writeError(msg.id, 'chat:error', (err as Error).message);
  }
}

async function handleContextBuild(msg: IPCMessage<ContextBuildPayload>): Promise<void> {
  const { paths, workspaceRoot } = msg.payload;
  const savedCwd = process.cwd();

  try {
    process.chdir(workspaceRoot);
    const result = await contextBuildCommand(paths, { output: 'json' });
    const response: IPCMessage<ContextResultPayload> = {
      id: msg.id,
      action: 'context:result',
      payload: result,
    };
    writeFrame(response);
  } catch (err) {
    writeError(msg.id, 'context:result', err instanceof Error ? err.message : String(err));
  } finally {
    process.chdir(savedCwd);
  }
}

async function handleAidlcInstall(msg: IPCMessage<{ workspaceRoot?: string; force?: boolean }>): Promise<void> {
  const workspace = msg.payload?.workspaceRoot ?? process.env['HARNESS_WORKSPACE'] ?? process.cwd();
  try {
    const result = await installAidlcRules(workspace, { force: msg.payload?.force });
    writeFrame({
      id: msg.id,
      action: 'aidlc:install:result',
      payload: result,
    });
  } catch (err) {
    writeError(msg.id, 'aidlc:install:result', err instanceof Error ? err.message : String(err));
  }
}

async function handleSetupBootstrap(
  msg: IPCMessage<{ workspaceRoot?: string; quiet?: boolean }>,
): Promise<void> {
  const workspace = msg.payload?.workspaceRoot ?? process.env['HARNESS_WORKSPACE'] ?? process.cwd();
  try {
    // Lightweight only — full setup (incl. Kiro download) must use `harness setup` subprocess.
    await installAidlcRules(workspace);
    writeFrame({
      id: msg.id,
      action: 'setup:bootstrap:result',
      payload: { ok: true, workspace },
    });
  } catch (err) {
    writeError(msg.id, 'setup:bootstrap:result', err instanceof Error ? err.message : String(err));
  }
}

function handleAidlcStatus(msg: IPCMessage<{ workspaceRoot?: string }>): void {
  const workspace = msg.payload?.workspaceRoot ?? process.env['HARNESS_WORKSPACE'] ?? process.cwd();
  const status = getAidlcStatus(workspace);
  writeFrame({
    id: msg.id,
    action: 'aidlc:status:result',
    payload: status,
  });
}

async function handleSpecParse(msg: IPCMessage<SpecParsePayload>): Promise<void> {
  try {
    const { specs, errors } = parseSpecDirectory(msg.payload.path);

    if (errors.length > 0) {
      process.stderr.write(
        `[harness-cli] Spec parse warnings: ${errors.map((e) => e.message).join('; ')}\n`,
      );
    }

    const response: IPCMessage<SpecResultPayload> = {
      id: msg.id,
      action: 'spec:result',
      payload: { specs },
    };
    writeFrame(response);
  } catch (err) {
    writeError(msg.id, 'spec:result', err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// File reader — CLI owns all file system I/O
// ---------------------------------------------------------------------------

async function readContextFiles(
  paths: string[],
): Promise<Array<{ path: string; content: string }>> {
  const results: Array<{ path: string; content: string }> = [];

  for (const absPath of paths) {
    try {
      const stat = fs.statSync(absPath);

      if (stat.isDirectory()) {
        const files = collectTextFiles(absPath, 3);
        for (const filePath of files.slice(0, 50)) {
          try {
            results.push({ path: filePath, content: fs.readFileSync(filePath, 'utf-8') });
          } catch {
            // Skip unreadable files
          }
        }
      } else {
        results.push({ path: absPath, content: fs.readFileSync(absPath, 'utf-8') });
      }
    } catch (err) {
      process.stderr.write(`[harness-cli] Cannot read context path "${absPath}": ${(err as Error).message}\n`);
    }
  }

  return results;
}

function emitUsageAndFinish(
  requestId: string,
  params: {
    sessionId: string;
    agent: AgentId;
    inputText: string;
    outputText: string;
    startedAt: number;
    mode: string;
    workspaceRoot: string;
  },
): void {
  const durationMs = Date.now() - params.startedAt;
  const stats = recordChatUsage({
    workspaceRoot: params.workspaceRoot,
    sessionId: params.sessionId,
    agent: params.agent,
    inputText: params.inputText,
    outputText: params.outputText,
    durationMs,
    mode: params.mode,
  });
  const tokensIn = estimateTokens(params.inputText);
  const tokensOut = estimateTokens(params.outputText);
  const alerts = evaluateBudgetAlerts(stats, loadSpendingBudgetSettings());
  writeFrame({
    id: requestId,
    action: 'chat:usage',
    payload: {
      sessionId: params.sessionId,
      agent: params.agent,
      tokensIn,
      tokensOut,
      tokensTotal: tokensIn + tokensOut,
      durationMs,
      stats: {
        updatedAt: stats.updatedAt,
        firstRequestAt: stats.firstRequestAt,
        lastRequestAt: stats.lastRequestAt,
        total: stats.total,
        byAgent: stats.byAgent,
        alerts,
      },
      alerts,
    },
  });
  if (alerts.length > 0) {
    writeFrame({
      id: requestId,
      action: 'usage:alerts',
      payload: { sessionId: params.sessionId, alerts },
    });
  }
}

async function handleChatFanout(
  msg: IPCMessage<ChatFanoutPayload>,
  router: AgentRouter,
): Promise<void> {
  const { sessionId, prompt, agents, contextPaths, mode, model } = msg.payload;
  const agentConfig = loadAgentConfig();
  const workspaceRoot = getWorkspaceRoot();

  const results = await runAgentFanout(router, {
    sessionId,
    prompt,
    agents,
    baseRequest: {
      sessionId,
      context: contextPaths.map((p) => ({
        absolutePath: p,
        kind: 'file' as const,
        label: p,
      })),
      config: agentConfig,
      mode: mode ?? 'ask',
      model,
      specCount: 0,
    },
  });

  const markdown = formatFanoutMarkdown(results);
  writeFrame({
    id: msg.id,
    action: 'chat:fanout:result',
    payload: { sessionId, markdown, results },
  });

  recordChatUsage({
    workspaceRoot,
    sessionId,
    agent: agents[0] ?? 'copilot',
    inputText: prompt,
    outputText: markdown,
    durationMs: results.reduce((s, r) => s + r.durationMs, 0),
    mode: 'fanout',
  });
}

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.cs', '.rb',
  '.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml',
  '.html', '.css', '.scss', '.sql', '.sh', '.bash',
]);

function collectTextFiles(dir: string, maxDepth: number, depth = 0): string[] {
  if (depth >= maxDepth) {
    return [];
  }

  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }

    const fullPath = `${dir}/${entry.name}`;

    if (entry.isDirectory()) {
      results.push(...collectTextFiles(fullPath, maxDepth, depth + 1));
    } else if (entry.isFile()) {
      const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop() ?? ''}` : '';
      if (TEXT_EXTENSIONS.has(ext.toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  return results;
}
