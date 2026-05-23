/**
 * CLI-side type definitions — mirrors the extension's types.ts.
 * Kept standalone to avoid cross-package imports at runtime.
 *
 * IMPORTANT: When changing these types, also update packages/extension/src/types.ts.
 * The two files are intentionally kept in sync manually to avoid a build-time
 * dependency between packages.
 */

/** Identifies which AI agent handles a request. Add new agents here + in AgentRouter. */
export type AgentId = 'copilot' | 'devin' | 'cursor' | 'claude' | 'kiro';

/** UI / IPC selection — `auto` is resolved to an `AgentId` before routing. */
export type AgentSelectionId = AgentId | 'auto';

export type ChatRole = 'user' | 'assistant' | 'system';
export type ContextItemKind = 'file' | 'directory' | 'snippet';

/**
 * GitHub Copilot interaction mode.
 * - `ask`        — simple Q&A chat, no tool calls
 * - `agent`      — autonomous coding with tool-calling loop (read/write/list/search)
 * - `spec+agent` — agent mode with .toddspect/specs/ injected as system context
 */
export type CopilotMode = 'ask' | 'agent' | 'spec+agent';

export type IpcAction =
  | 'chat:send'
  | 'chat:send:ack'
  | 'chat:cancel'
  | 'chat:chunk'
  | 'chat:done'
  | 'chat:error'
  | 'chat:auto-routed'
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
  | 'setup:bootstrap:result'
  | 'usage:get'
  | 'usage:stats'
  | 'usage:reset'
  | 'usage:reset:result'
  | 'usage:alerts'
  | 'chat:usage'
  | 'chat:tool'
  | 'session:load'
  | 'session:loaded'
  | 'session:save'
  | 'session:saved'
  | 'session:clear'
  | 'session:cleared'
  | 'spec:discover'
  | 'spec:discover:result'
  | 'chat:fanout'
  | 'chat:fanout:result'
  | 'plugins:list'
  | 'plugins:list:result'
  | 'sdd:workflow:status'
  | 'sdd:workflow:status:result'
  | 'sdd:workflow:init'
  | 'sdd:workflow:init:result'
  | 'sdd:workflow:createFeature'
  | 'sdd:workflow:createFeature:result'
  | 'sdd:workflow:writeArtifact'
  | 'sdd:workflow:writeArtifact:result'
  | 'sdd:workflow:stepPrompt'
  | 'sdd:workflow:stepPrompt:result';

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

/**
 * Payload for the `chat:send` IPC action.
 *
 * The extension resolves all file paths before sending — the CLI daemon is
 * responsible for reading file contents (never the extension host).
 */
export interface ChatSendPayload {
  sessionId: string;
  messages: ChatMessage[];
  /** Absolute paths to context files/dirs selected by the user. CLI reads them. */
  contextPaths: string[];
  agent: AgentSelectionId;
  /** Relative or absolute path to the specs directory (default: .toddspect/specs). */
  specsDir?: string;
  /** Interaction mode — defaults to 'ask'. Only used for copilot agent today. */
  mode?: CopilotMode;
  /** Absolute paths to spec YAML files, pre-resolved by the extension for spec+agent mode. */
  specPaths?: string[];
  /** Provider model id (`auto` = provider default). */
  model?: string;
}

/** Live tool/file events during agent runs (extension opens diffs + terminal). */
export interface ChatToolEventPayload {
  sessionId: string;
  tool: string;
  phase: 'before' | 'after' | 'terminal';
  path?: string;
  oldContent?: string | null;
  preview?: string;
  command?: string;
}

export interface ChatChunkPayload {
  sessionId: string;
  messageId: string;
  chunk: string;
  done: boolean;
}

/** Emitted when the user selected Auto and the CLI picked a concrete agent. */
export interface ChatAutoRoutedPayload {
  sessionId: string;
  agent: AgentId;
  ruleId: string;
  reason: string;
  fallbackUsed: boolean;
  scores: Record<AgentId, number>;
}

/** Emitted after a chat turn completes — token estimates + timing. */
export interface BudgetAlertPayload {
  level: 'warn' | 'exceeded';
  scope: 'total' | AgentId;
  message: string;
  current: number;
  limit: number;
  percent: number;
}

export interface ChatUsagePayload {
  sessionId: string;
  agent: AgentId;
  tokensIn: number;
  tokensOut: number;
  tokensTotal: number;
  durationMs: number;
  stats: UsageStatsPayload;
  alerts?: BudgetAlertPayload[];
}

export interface UsageStatsPayload {
  updatedAt: string;
  firstRequestAt?: string;
  lastRequestAt?: string;
  total: {
    requests: number;
    tokensIn: number;
    tokensOut: number;
    tokensTotal: number;
    totalDurationMs: number;
  };
  byAgent: Record<
    AgentId,
    {
      requests: number;
      tokensIn: number;
      tokensOut: number;
      tokensTotal: number;
      totalDurationMs: number;
    }
  >;
  alerts?: BudgetAlertPayload[];
}

export interface SessionSavePayload {
  sessionId: string;
  selectedAgent: AgentSelectionId;
  selectedMode: CopilotMode;
  model?: string;
  messages: ChatMessage[];
  contextPaths: string[];
}

export interface SessionLoadedPayload {
  session: {
    sessionId: string;
    selectedAgent: AgentSelectionId;
    selectedMode: CopilotMode;
    model?: string;
    messages: ChatMessage[];
    contextPaths: string[];
    updatedAt: string;
  } | null;
}

export interface SpecDiscoverResultPayload {
  workspaceRoot: string;
  suggestions: Array<{
    id: string;
    title: string;
    kind: string;
    reason: string;
    suggestedFile: string;
    template: string;
  }>;
}

export interface ChatFanoutPayload {
  sessionId: string;
  prompt: string;
  agents: AgentId[];
  contextPaths: string[];
  mode?: CopilotMode;
  model?: string;
}

export interface ChatFanoutResultPayload {
  sessionId: string;
  markdown: string;
  results: Array<{
    agent: AgentId;
    ok: boolean;
    text: string;
    error?: string;
    durationMs: number;
  }>;
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
