/**
 * Shared type definitions used across the extension and webview bundles.
 * Keep this file free of Node/VSCode-specific imports so it can be imported
 * from both the extension host and browser-based webview contexts.
 */

// ---------------------------------------------------------------------------
// Agent identifiers
// ---------------------------------------------------------------------------

export type AgentId = 'copilot' | 'devin' | 'cursor' | 'claude' | 'kiro';

export interface AgentDescriptor {
  id: AgentId;
  label: string;
  description: string;
  supportsStreaming: boolean;
  supportsMcp: boolean;
}

export const AGENT_DESCRIPTORS: Record<AgentId, AgentDescriptor> = {
  copilot: {
    id: 'copilot',
    label: 'GitHub Copilot',
    description: 'GitHub Copilot via REST API',
    supportsStreaming: true,
    supportsMcp: false,
  },
  devin: {
    id: 'devin',
    label: 'Devin',
    description: 'Cognition AI Devin autonomous engineer',
    supportsStreaming: false,
    supportsMcp: false,
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor AI',
    description: 'Cursor AI via MCP or HTTP',
    supportsStreaming: true,
    supportsMcp: true,
  },
  claude: {
    id: 'claude',
    label: 'Claude Code',
    description: 'Anthropic Claude Code via CLI subprocess',
    supportsStreaming: true,
    supportsMcp: true,
  },
  kiro: {
    id: 'kiro',
    label: 'AWS KIRO',
    description: 'AWS KIRO via REST API',
    supportsStreaming: false,
    supportsMcp: false,
  },
};

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  agent?: AgentId;
  /** True while the assistant is still streaming this message */
  streaming?: boolean;
  /** Error message if the agent call failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Context items
// ---------------------------------------------------------------------------

export type ContextItemKind = 'file' | 'directory' | 'snippet';

export interface ContextItem {
  uri: string;
  kind: ContextItemKind;
  label: string;
  /** Token estimate for budget tracking */
  tokenEstimate?: number;
}

// ---------------------------------------------------------------------------
// Spec / SDD definitions
// ---------------------------------------------------------------------------

export type SpecKind = 'Skill' | 'Tool' | 'Workflow';

export interface SpecTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface SpecDefinition {
  kind: SpecKind;
  name: string;
  description: string;
  tools?: SpecTool[];
  agents?: {
    preferred: AgentId;
    fallback?: AgentId;
  };
  /** Raw file path this spec was loaded from */
  filePath?: string;
}

// ---------------------------------------------------------------------------
// IPC message types (Extension Host ↔ CLI Process)
// ---------------------------------------------------------------------------

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
  specs: SpecDefinition[];
}

// ---------------------------------------------------------------------------
// Webview → Extension messages
// ---------------------------------------------------------------------------

export type WebviewCommand =
  | 'sendMessage'
  | 'selectAgent'
  | 'addContext'
  | 'removeContext'
  | 'clearContext'
  | 'showContext'
  | 'loadSpecs'
  | 'saveSpec'
  | 'deleteSpec'
  | 'openConfig'
  | 'ready';

export interface WebviewMessage<T = unknown> {
  command: WebviewCommand;
  payload?: T;
}

// ---------------------------------------------------------------------------
// Extension → Webview messages
// ---------------------------------------------------------------------------

export type ExtensionCommand =
  | 'appendChunk'
  | 'messageComplete'
  | 'messageError'
  | 'contextUpdated'
  | 'specsLoaded'
  | 'specSaved'
  | 'agentChanged'
  | 'initialize'
  | 'error';

export interface ExtensionMessage<T = unknown> {
  command: ExtensionCommand;
  payload?: T;
}

export interface InitializePayload {
  agent: AgentId;
  context: ContextItem[];
  history: ChatMessage[];
  agents: AgentDescriptor[];
}
