/**
 * Cursor SDK local runtime — edits files in HARNESS_WORKSPACE via @cursor/sdk.
 * Does not use GitHub Copilot; requires CURSOR_API_KEY / harness.connectors.cursor.apiKey.
 *
 * @cursor/sdk is loaded at runtime (dynamic import) so the CLI bundle stays external-friendly.
 */
import fs from 'fs';
import path from 'path';
import type { ChatMessage, ChatToolEventPayload, ContextItem, CopilotMode } from '../types.js';
import { resolveProviderModel } from '../models/providerModels.js';
import { buildCursorPrompt } from './cursorCloud.js';
import { isChatSessionCancelled } from '../session/cancel.js';
import { harnessLog, harnessWarn } from '../log.js';

export class CursorLocalUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CursorLocalUnavailableError';
  }
}

interface CursorSdkLoaded {
  Agent: {
    create: (opts: {
      apiKey: string;
      model: { id: string };
      local: { cwd: string };
    }) => Promise<SdkAgentHandle>;
  };
  CursorAgentError: new (message?: string) => Error;
}

interface SdkToolCallEvent {
  type: 'tool_call';
  name: string;
  status: 'running' | 'completed' | 'error';
  args?: unknown;
}

interface SdkAssistantEvent {
  type: 'assistant';
  message: {
    content: Array<{ type: string; text?: string }>;
  };
}

interface SdkAgentHandle {
  agentId: string;
  send(
    message: string,
    options?: { model?: { id: string } },
  ): Promise<SdkRunHandle>;
  [Symbol.asyncDispose](): Promise<void>;
}

interface SdkRunHandle {
  id: string;
  status: string;
  supports(op: string): boolean;
  stream(): AsyncGenerator<SdkToolCallEvent | SdkAssistantEvent | { type: string }>;
  wait(): Promise<{ status: string; result?: string }>;
  cancel(): Promise<void>;
}

interface SessionEntry {
  agent: SdkAgentHandle;
  activeRun?: SdkRunHandle;
}

const sessionAgents = new Map<string, SessionEntry>();

let sdkModulePromise: Promise<CursorSdkLoaded> | undefined;

const CURSOR_SDK_MODULE = '@cursor' + '/sdk';

async function loadCursorSdk(): Promise<CursorSdkLoaded> {
  if (!sdkModulePromise) {
    sdkModulePromise = import(CURSOR_SDK_MODULE).catch((err: Error) => {
      sdkModulePromise = undefined;
      throw new CursorLocalUnavailableError(
        `Could not load @cursor/sdk: ${err.message}`,
      );
    }) as Promise<CursorSdkLoaded>;
  }
  return sdkModulePromise;
}

export function clearCursorLocalSession(sessionId: string): void {
  const entry = sessionAgents.get(sessionId);
  if (entry) {
    sessionAgents.delete(sessionId);
    void entry.agent[Symbol.asyncDispose]().catch((err: Error) => {
      harnessWarn(`[cursor-local] dispose failed: ${err.message}`);
    });
  }
}

export interface CursorLocalRequest {
  sessionId: string;
  messages: ChatMessage[];
  context: ContextItem[];
  mode?: CopilotMode;
  apiKey: string;
  model?: string;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onToolEvent?: (event: Omit<ChatToolEventPayload, 'sessionId'>) => void;
}

function cursorSdkModelId(model?: string): string {
  const pick = resolveProviderModel('cursor', model) ?? (model ?? 'auto').trim();
  if (!pick || pick === 'auto') {
    return 'composer-2';
  }
  switch (pick) {
    case 'claude-sonnet':
      return 'claude-sonnet-4-20250514';
    case 'gpt-4o':
      return 'gpt-4o';
    default:
      return pick;
  }
}

function workspaceRoot(): string {
  return process.env['HARNESS_WORKSPACE']?.trim() || process.cwd();
}

function resolveWorkspacePath(filePath: string): string {
  const workspace = workspaceRoot();
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(workspace, filePath);
}

function extractFilePath(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') {
    return undefined;
  }
  const record = args as Record<string, unknown>;
  for (const key of ['path', 'file_path', 'filePath', 'target', 'file', 'relativePath']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function isFileWriteTool(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n === 'write' ||
    n === 'edit' ||
    n.includes('write') ||
    n.includes('edit') ||
    n.includes('search_replace') ||
    n.includes('apply_patch')
  );
}

function extractShellCommand(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') {
    return undefined;
  }
  const record = args as Record<string, unknown>;
  if (typeof record.command === 'string') {
    return record.command;
  }
  if (typeof record.cmd === 'string') {
    return record.cmd;
  }
  return undefined;
}

function emitToolEvents(
  event: SdkToolCallEvent,
  onToolEvent?: (event: Omit<ChatToolEventPayload, 'sessionId'>) => void,
): void {
  if (!onToolEvent) {
    return;
  }

  const toolName = event.name.toLowerCase();
  if (toolName === 'shell' || toolName.includes('shell')) {
    if (event.status === 'running') {
      const command = extractShellCommand(event.args);
      if (command) {
        onToolEvent({
          tool: 'run_shell',
          phase: 'terminal',
          command,
        });
      }
    }
    return;
  }

  if (!isFileWriteTool(event.name)) {
    return;
  }

  const relOrAbs = extractFilePath(event.args);
  if (!relOrAbs) {
    return;
  }
  const abs = resolveWorkspacePath(relOrAbs);

  if (event.status === 'running') {
    const oldContent = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
    onToolEvent({
      tool: 'write_file',
      phase: 'before',
      path: abs,
      oldContent,
    });
  } else if (event.status === 'completed') {
    let preview = '';
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, 'utf-8');
      preview = content.length > 400 ? `${content.slice(0, 400)}…` : content;
    }
    onToolEvent({
      tool: 'write_file',
      phase: 'after',
      path: abs,
      preview,
    });
  }
}

function lastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'user' && m.content.trim()) {
      return m.content.trim();
    }
  }
  return '';
}

async function getOrCreateAgent(
  sessionId: string,
  apiKey: string,
  modelId: string,
  cwd: string,
): Promise<SdkAgentHandle> {
  const existing = sessionAgents.get(sessionId);
  if (existing) {
    return existing.agent;
  }

  const { Agent, CursorAgentError } = await loadCursorSdk();
  let agent: SdkAgentHandle;
  try {
    agent = (await Agent.create({
      apiKey,
      model: { id: modelId },
      local: { cwd },
    })) as SdkAgentHandle;
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new CursorLocalUnavailableError(err.message);
    }
    throw err;
  }

  sessionAgents.set(sessionId, { agent });
  harnessLog(`[cursor-local] session=${sessionId} agent=${agent.agentId} cwd=${cwd}`);
  return agent;
}

export async function cancelCursorLocalSession(sessionId: string): Promise<void> {
  const entry = sessionAgents.get(sessionId);
  if (!entry) {
    return;
  }
  const run = entry.activeRun;
  if (run?.supports('cancel') && run.status === 'running') {
    try {
      await run.cancel();
    } catch (err) {
      harnessWarn(`[cursor-local] cancel failed: ${(err as Error).message}`);
    }
  }
  entry.activeRun = undefined;
}

export async function routeCursorLocal(req: CursorLocalRequest): Promise<void> {
  const apiKey = req.apiKey.trim();
  if (!apiKey) {
    req.onError(
      'Cursor API key required for local file edits. Set CURSOR_API_KEY or harness.connectors.cursor.apiKey ' +
        '(https://cursor.com/dashboard/integrations).',
    );
    return;
  }

  const { CursorAgentError } = await loadCursorSdk();

  const cwd = workspaceRoot();
  const modelId = cursorSdkModelId(req.model);
  const isFollowUp = sessionAgents.has(req.sessionId);
  const userTail = lastUserMessage(req.messages);
  const prompt =
    isFollowUp && userTail ? userTail : buildCursorPrompt(req.messages, req.context);

  if (!prompt.trim()) {
    req.onError('No user message to send to Cursor local agent.');
    return;
  }

  let agent: SdkAgentHandle;
  try {
    agent = await getOrCreateAgent(req.sessionId, apiKey, modelId, cwd);
  } catch (err) {
    if (err instanceof CursorLocalUnavailableError) {
      throw err;
    }
    if (err instanceof CursorAgentError) {
      throw new CursorLocalUnavailableError(err.message);
    }
    throw err;
  }

  req.onChunk('**[Agent]** Cursor local run starting…\n\n');
  harnessLog(`[cursor-local] session=${req.sessionId} model=${modelId} followUp=${isFollowUp}`);

  let run: SdkRunHandle;
  try {
    run = (await agent.send(prompt, { model: { id: modelId } })) as SdkRunHandle;
    const entry = sessionAgents.get(req.sessionId);
    if (entry) {
      entry.activeRun = run;
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      req.onError(`Cursor local agent failed to start: ${err.message}`);
      return;
    }
    throw err;
  }

  let assistantBuffer = '';

  try {
    if (run.supports('stream')) {
      for await (const event of run.stream()) {
        if (isChatSessionCancelled(req.sessionId)) {
          if (run.supports('cancel')) {
            await run.cancel();
          }
          req.onChunk('\n**[Agent]** Stopped by user.\n');
          req.onDone();
          return;
        }

        if (event.type === 'assistant') {
          const assistant = event as SdkAssistantEvent;
          for (const block of assistant.message.content) {
            if (block.type === 'text' && block.text) {
              assistantBuffer += block.text;
              req.onChunk(block.text);
            }
          }
        } else if (event.type === 'tool_call') {
          const toolEvent = event as SdkToolCallEvent;
          emitToolEvents(toolEvent, req.onToolEvent);
          if (toolEvent.status === 'running') {
            req.onChunk(`\n**[Agent]** ${toolEvent.name}…\n`);
          } else if (toolEvent.status === 'error') {
            req.onChunk(`\n**[Agent]** ${toolEvent.name} failed.\n`);
          }
        }
      }
    }

    const result = await run.wait();
    if (result.status === 'error') {
      req.onError(
        `Cursor local agent run failed${result.result ? `: ${result.result}` : ''}.`,
      );
      return;
    }
    if (!assistantBuffer.trim() && result.result?.trim()) {
      req.onChunk(`${result.result.trim()}\n`);
    }
    const entry = sessionAgents.get(req.sessionId);
    if (entry) {
      entry.activeRun = undefined;
    }
    req.onDone();
  } catch (err) {
    if (isChatSessionCancelled(req.sessionId)) {
      req.onChunk('\n**[Agent]** Stopped by user.\n');
      req.onDone();
      return;
    }
    const msg = (err as Error).message;
    if (err instanceof CursorAgentError) {
      req.onError(`Cursor local agent error: ${msg}`);
      return;
    }
    throw err;
  }
}
