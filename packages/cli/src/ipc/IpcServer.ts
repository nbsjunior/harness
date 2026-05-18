import * as fs from 'fs';
import { AgentRouter } from '../router/AgentRouter.js';
import { parseSpecDirectory } from '../parsers/specParser.js';
import { contextBuildCommand } from '../commands/contextBuild.js';
import { loadAgentConfig } from '../config.js';
import { installAidlcRules } from '../aidlc/install.js';
import { getAidlcStatus } from '../aidlc/status.js';
import { installAidlcRules } from '../aidlc/install.js';
import type {
  IPCMessage,
  ChatSendPayload,
  ChatChunkPayload,
  ContextBuildPayload,
  ContextResultPayload,
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
  const { sessionId, messages, contextPaths, agent, specsDir } = msg.payload;
  const agentConfig = loadAgentConfig(specsDir);
  const messageId = crypto.randomUUID();

  // Read context files from absolute paths (CLI owns all file I/O)
  const contextFiles = await readContextFiles(contextPaths);

  // Append context as a system message so the router can inject it
  const enrichedMessages = [...messages];
  if (contextFiles.length > 0) {
    const contextBlock = contextFiles
      .map(({ path, content }) => `<file path="${path}">\n${content}\n</file>`)
      .join('\n\n');

    enrichedMessages.unshift({
      id: crypto.randomUUID(),
      role: 'system',
      content: `The user has selected the following files as context:\n\n${contextBlock}`,
      timestamp: Date.now(),
    });
  }

  await router.route({
    sessionId,
    messages: enrichedMessages,
    context: contextPaths.map((p) => ({ absolutePath: p, kind: 'file', label: p })),
    agent,
    config: agentConfig,
    onChunk: (chunk) => {
      const frame: IPCMessage<ChatChunkPayload> = {
        id: msg.id,
        action: 'chat:chunk',
        payload: { sessionId, messageId, chunk, done: false },
      };
      writeFrame(frame);
    },
    onDone: () => {
      const frame: IPCMessage<ChatChunkPayload> = {
        id: msg.id,
        action: 'chat:chunk',
        payload: { sessionId, messageId, chunk: '', done: true },
      };
      writeFrame(frame);
    },
    onError: (error) => {
      writeError(msg.id, 'chat:error', error);
    },
  });
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
