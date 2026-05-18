import { getEachMessage, sendMessage } from 'execa';
import { AgentRouter } from '../router/AgentRouter.js';
import { parseSpecDirectory } from '../parsers/specParser.js';
import { contextBuildCommand } from '../commands/contextBuild.js';
import type {
  IpcMessage,
  ChatSendPayload,
  ChatChunkPayload,
  ChatErrorPayload,
  ContextBuildPayload,
  ContextResultPayload,
  SpecParsePayload,
  SpecResultPayload,
} from '../types.js';
import yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

/**
 * IPC server — runs when the CLI is started with `--ipc` flag by the VSCode extension.
 * Listens for structured JSON messages from the extension host and responds
 * using execa's IPC channel (process.on('message') / process.send()).
 */
export async function startIpcServer(): Promise<void> {
  const router = new AgentRouter();

  // Signal readiness immediately after startup
  process.stderr.write('[harness-cli] IPC server ready\n');

  for await (const rawMessage of getEachMessage()) {
    const msg = rawMessage as IpcMessage;
    void handleMessage(msg, router);
  }
}

async function handleMessage(msg: IpcMessage, router: AgentRouter): Promise<void> {
  if (!msg?.id || !msg?.type) {
    return;
  }

  switch (msg.type) {
    case 'ping':
      await respond({ id: msg.id, type: 'pong', payload: {} });
      break;

    case 'chat:send':
      await handleChatSend(msg as IpcMessage<ChatSendPayload>, router);
      break;

    case 'context:build':
      await handleContextBuild(msg as IpcMessage<ContextBuildPayload>);
      break;

    case 'spec:parse':
      await handleSpecParse(msg as IpcMessage<SpecParsePayload>);
      break;

    case 'agent:list':
      await respond({
        id: msg.id,
        type: 'agent:list:result',
        payload: {
          agents: ['copilot', 'devin', 'cursor', 'claude', 'kiro'],
        },
      });
      break;

    default:
      process.stderr.write(`[harness-cli] Unknown IPC message type: ${msg.type}\n`);
  }
}

async function handleChatSend(
  msg: IpcMessage<ChatSendPayload>,
  router: AgentRouter,
): Promise<void> {
  const { sessionId, messages, context, agent, specsDir } = msg.payload;
  const agentConfig = loadAgentConfig(specsDir);
  const messageId = crypto.randomUUID();

  await router.route({
    sessionId,
    messages,
    context,
    agent,
    config: agentConfig,
    onChunk: (chunk) => {
      void sendMessage({
        id: msg.id,
        type: 'chat:chunk',
        payload: {
          sessionId,
          messageId,
          chunk,
          done: false,
        } satisfies ChatChunkPayload,
      });
    },
    onDone: () => {
      void sendMessage({
        id: msg.id,
        type: 'chat:chunk',
        payload: {
          sessionId,
          messageId,
          chunk: '',
          done: true,
        } satisfies ChatChunkPayload,
      });
    },
    onError: (error) => {
      void sendMessage({
        id: msg.id,
        type: 'chat:error',
        payload: {
          sessionId,
          messageId,
          error,
        } satisfies ChatErrorPayload,
      });
    },
  });
}

async function handleContextBuild(msg: IpcMessage<ContextBuildPayload>): Promise<void> {
  const { directories, workspaceRoot } = msg.payload;
  const savedCwd = process.cwd();

  try {
    process.chdir(workspaceRoot);
    const result = await contextBuildCommand(directories, { output: 'json' });
    await respond({
      id: msg.id,
      type: 'context:result',
      payload: result satisfies ContextResultPayload,
    });
  } catch (err) {
    await respond({
      id: msg.id,
      type: 'chat:error',
      payload: {
        sessionId: '',
        messageId: msg.id,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  } finally {
    process.chdir(savedCwd);
  }
}

async function handleSpecParse(msg: IpcMessage<SpecParsePayload>): Promise<void> {
  const { filePath } = msg.payload;

  try {
    const { specs, errors } = parseSpecDirectory(filePath);

    if (errors.length > 0) {
      process.stderr.write(
        `[harness-cli] Spec parse warnings: ${errors.map((e) => e.message).join(', ')}\n`,
      );
    }

    await respond({
      id: msg.id,
      type: 'spec:result',
      payload: { specs } satisfies SpecResultPayload,
    });
  } catch (err) {
    await respond({
      id: msg.id,
      type: 'chat:error',
      payload: {
        sessionId: '',
        messageId: msg.id,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

async function respond(msg: IpcMessage): Promise<void> {
  await sendMessage(msg);
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

interface HarnessConfig {
  connectors?: {
    copilot?: { token?: string; endpoint?: string };
    devin?: { apiKey?: string; endpoint?: string };
    cursor?: { apiKey?: string; endpoint?: string };
    claude?: { path?: string; apiKey?: string };
    kiro?: { apiKey?: string; endpoint?: string };
  };
}

function loadAgentConfig(specsDir?: string) {
  const configCandidates = [
    specsDir ? path.join(specsDir, '..', 'config.yaml') : null,
    path.join(process.env['HARNESS_WORKSPACE'] ?? process.cwd(), '.harness', 'config.yaml'),
  ].filter(Boolean) as string[];

  let config: HarnessConfig = {};

  for (const candidate of configCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        config = (yaml.load(fs.readFileSync(candidate, 'utf-8')) as HarnessConfig) ?? {};
      } catch {
        // Ignore malformed config
      }
      break;
    }
  }

  const c = config.connectors ?? {};

  return {
    copilot: {
      token: c.copilot?.token ?? process.env['GITHUB_TOKEN'] ?? process.env['COPILOT_TOKEN'] ?? '',
      endpoint: c.copilot?.endpoint ?? 'https://api.githubcopilot.com',
    },
    devin: {
      apiKey: c.devin?.apiKey ?? process.env['DEVIN_API_KEY'] ?? '',
      endpoint: c.devin?.endpoint ?? 'https://api.devin.ai/v1',
    },
    cursor: {
      apiKey: c.cursor?.apiKey ?? process.env['CURSOR_API_KEY'] ?? '',
      endpoint: c.cursor?.endpoint ?? '',
    },
    claude: {
      path: c.claude?.path ?? process.env['CLAUDE_PATH'] ?? 'claude',
      apiKey: c.claude?.apiKey ?? process.env['ANTHROPIC_API_KEY'],
    },
    kiro: {
      apiKey: c.kiro?.apiKey ?? process.env['KIRO_API_KEY'] ?? '',
      endpoint: c.kiro?.endpoint ?? '',
    },
  };
}
