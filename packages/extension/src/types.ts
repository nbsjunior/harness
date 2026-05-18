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
    label: 'Kiro (AI-DLC)',
    description: 'Kiro CLI with AWS AI-DLC steering rules (.kiro/steering)',
    supportsStreaming: false,
    supportsMcp: true,
  },
};

// ---------------------------------------------------------------------------
// Copilot interaction modes
// ---------------------------------------------------------------------------

/**
 * Ask    — conversational Q&A, no file modifications suggested.
 * Agent  — autonomous coding agent: produces structured file edits, can use tools.
 * spec+agent — like Agent but injects all active Specs as system context first.
 */
export type CopilotMode = 'ask' | 'agent' | 'spec+agent';

export const COPILOT_MODE_LABELS: Record<CopilotMode, string> = {
  ask:         'Ask',
  agent:       'Agent',
  'spec+agent':'Spec+Agent',
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
  /** Absolute file-system path (not URI) — required by the CLI for direct fs.readFile */
  absolutePath: string;
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
// IPC Protocol
//
// All communication between the Extension Host (broker) and the CLI (daemon)
// flows as newline-delimited JSON over stdin/stdout.
//
// Schema: { id, action, payload, error? }
//   id      — correlation UUID, matched in response
//   action  — discriminant string (e.g. "chat:send", "ping")
//   payload — typed data (generic T)
//   error   — present only in error responses; human-readable message
// ---------------------------------------------------------------------------

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
 * Base IPC message envelope. All extension ↔ CLI communication uses this shape.
 * - Requests carry `action` + `payload`.
 * - Responses carry the same `id` + `action` + `payload`, or `error` on failure.
 */
export interface IPCMessage<TPayload = unknown> {
  /** Correlation ID (UUID). The response mirrors the request's id. */
  id: string;
  /** Discriminant action string. */
  action: IpcAction;
  /** Typed request/response data. */
  payload: TPayload;
  /** Present only when the message represents an error. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Typed payload definitions
// ---------------------------------------------------------------------------

export interface ChatSendPayload {
  sessionId: string;
  messages: ChatMessage[];
  /** Absolute paths to context files/directories */
  contextPaths: string[];
  agent: AgentId;
  specsDir?: string;
  /** Interaction mode — defaults to 'ask' */
  mode?: CopilotMode;
  /** Resolved spec file paths — populated by extension for spec+agent mode */
  specPaths?: string[];
}

export interface ChatChunkPayload {
  sessionId: string;
  messageId: string;
  chunk: string;
  done: boolean;
}

export interface ContextBuildPayload {
  /** Absolute paths to scan */
  paths: string[];
  workspaceRoot: string;
}

export interface ContextResultPayload {
  items: ContextItem[];
  totalTokenEstimate: number;
}

export interface SpecParsePayload {
  /** Absolute path to a spec file or directory */
  path: string;
}

export interface SpecResultPayload {
  specs: SpecDefinition[];
}

export interface McpCallPayload {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Webview → Extension messages
// ---------------------------------------------------------------------------

export type WebviewCommand =
  | 'sendMessage'
  | 'selectAgent'
  | 'selectMode'
  | 'addContext'
  | 'removeContext'
  | 'clearContext'
  | 'showContext'
  | 'loadSpecs'
  | 'saveSpec'
  | 'deleteSpec'
  | 'openConfig'
  | 'ready'
  // Chat streaming control
  | 'stopStream'
  // Configuration wizard
  | 'saveSecret'
  | 'testConnection'
  | 'getSecretStatus'
  | 'saveSetting'
  | 'openChat'
  | 'openSettingsJson'
  | 'openExtensionSettings'
  | 'initWorkspace';

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
  | 'modeChanged'
  | 'initialize'
  | 'error'
  // Token usage (for status bar display)
  | 'tokenUsage'
  | 'streamStopped'
  // Configuration wizard responses
  | 'configLoaded'
  | 'connectionResult'
  | 'secretStatus';

export interface ExtensionMessage<T = unknown> {
  command: ExtensionCommand;
  payload?: T;
}

export interface InitializePayload {
  agent: AgentId;
  mode: CopilotMode;
  context: ContextItem[];
  history: ChatMessage[];
  agents: AgentDescriptor[];
}

export interface TokenUsagePayload {
  sessionTokens: number;
  dailyTokens: number;
  budgetTokens: number;
}

export interface ConnectionResultPayload {
  agent: AgentId;
  ok: boolean;
  error?: string;
  model?: string;
}

export interface SecretStatusPayload {
  copilot: boolean;
  devin: boolean;
  cursor: boolean;
  claude: boolean;
  kiro: boolean;
}
