/**
 * CLI-side type definitions — mirrors the extension's types.ts.
 * Kept standalone to avoid cross-package imports at runtime.
 */

export type AgentId = 'copilot' | 'devin' | 'cursor' | 'claude' | 'kiro';
export type ChatRole = 'user' | 'assistant' | 'system';
export type ContextItemKind = 'file' | 'directory' | 'snippet';

export type IpcAction =
  | 'chat:send'
  | 'chat:chunk'
  | 'chat:done'
  | 'chat:error'
  | 'context:build'
  | 'context:result'
  | 'spec:parse'
  | 'spec:result'
  | 'agent:list'
  | 'agent:list:result'
  | 'mcp:call'
  | 'mcp:result'
  | 'ping'
  | 'pong'
  | 'aidlc:install'
  | 'aidlc:install:result'
  | 'aidlc:status'
  | 'aidlc:status:result'
  | 'setup:bootstrap'
  | 'setup:bootstrap:result';

/**
 * Base IPC message envelope used for all stdin/stdout newline-delimited JSON
 * communication between the VSCode Extension Host and the CLI daemon.
 */
export interface IPCMessage<TPayload = unknown> {
  id: string;
  action: IpcAction;
  payload: TPayload;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  agent?: AgentId;
}

export interface ContextItem {
  /** Absolute file-system path — CLI reads this directly */
  absolutePath: string;
  kind: ContextItemKind;
  label: string;
  tokenEstimate?: number;
}

export interface ChatSendPayload {
  sessionId: string;
  messages: ChatMessage[];
  /** Absolute paths resolved by the extension before dispatching */
  contextPaths: string[];
  agent: AgentId;
  specsDir?: string;
}

export interface ChatChunkPayload {
  sessionId: string;
  messageId: string;
  chunk: string;
  done: boolean;
}

export interface ContextBuildPayload {
  paths: string[];
  workspaceRoot: string;
}

export interface ContextResultPayload {
  items: ContextItem[];
  totalTokenEstimate: number;
}

export interface SpecParsePayload {
  path: string;
}

export interface SpecResultPayload {
  specs: unknown[];
}

export interface McpCallPayload {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
}
