/**
 * CLI-side type definitions (mirrors the extension's types.ts).
 * Kept as a standalone file to avoid importing from the extension package.
 */

export type AgentId = 'copilot' | 'devin' | 'cursor' | 'claude' | 'kiro';
export type ChatRole = 'user' | 'assistant' | 'system';
export type ContextItemKind = 'file' | 'directory' | 'snippet';
export type IpcMessageType =
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
  | 'pong';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  agent?: AgentId;
}

export interface ContextItem {
  uri: string;
  kind: ContextItemKind;
  label: string;
  tokenEstimate?: number;
}

export interface IpcMessage<T = unknown> {
  id: string;
  type: IpcMessageType;
  payload: T;
}

export interface ChatSendPayload {
  sessionId: string;
  messages: ChatMessage[];
  context: ContextItem[];
  agent: AgentId;
  specsDir?: string;
}

export interface ChatChunkPayload {
  sessionId: string;
  messageId: string;
  chunk: string;
  done: boolean;
}

export interface ChatErrorPayload {
  sessionId: string;
  messageId: string;
  error: string;
}

export interface ContextBuildPayload {
  directories: string[];
  workspaceRoot: string;
}

export interface ContextResultPayload {
  items: ContextItem[];
  totalTokenEstimate: number;
}

export interface SpecParsePayload {
  filePath: string;
}

export interface SpecResultPayload {
  specs: unknown[];
}
