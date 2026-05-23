/**
 * @module types
 * Shared type definitions for the extension host and webview bundles.
 *
 * **Why a single types file:** Webviews compile separately (esbuild) but must share
 * exact payload shapes with the host. Keep this file free of `vscode` imports.
 *
 * **CLI mirror:** `packages/cli/src/types.ts` duplicates IPC shapes — update both when
 * changing `IpcAction` or `ChatSendPayload`.
 *
 * @see docs/code-map.md
 */

// ---------------------------------------------------------------------------
// Agent identifiers
// ---------------------------------------------------------------------------

export type AgentId = 'copilot' | 'devin' | 'cursor' | 'claude' | 'kiro';

/** Chat provider selection — `auto` is resolved by the CLI auto-router before routing. */
export type AgentSelectionId = AgentId | 'auto';

export interface AutoSelectionDescriptor {
  id: 'auto';
  label: string;
  description: string;
}

export const AUTO_SELECTION_DESCRIPTOR: AutoSelectionDescriptor = {
  id: 'auto',
  label: 'Auto',
  description:
    'Harness of AI picks the best provider from your prompt (default: Copilot; complex code → Claude; integrations → Claude; specs → Kiro; …)',
};

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
    description:
      'Cursor — Ask uses Cloud API; Agent edits your VS Code workspace locally when Copilot is configured (Live Edits)',
    supportsStreaming: true,
    supportsMcp: false,
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
// SDD workflow (GitHub spec-kit aligned — .harness/sdd/)
// ---------------------------------------------------------------------------

export type SddStepId =
  | 'constitution'
  | 'specify'
  | 'clarify'
  | 'plan'
  | 'tasks'
  | 'analyze'
  | 'checklist'
  | 'implement'
  | 'taskstoissues';

export type SddStepStatus = 'locked' | 'ready' | 'done' | 'optional';

export interface SddWorkflowStepInfo {
  id: SddStepId;
  slashCommand: string;
  label: string;
  description: string;
  phase: string;
  optional: boolean;
  requires: SddStepId[];
  artifactPattern?: string;
}

export interface SddFeatureSummary {
  id: string;
  dirName: string;
  hasSpec: boolean;
  hasPlan: boolean;
  hasTasks: boolean;
}

export interface SddStepState {
  id: SddStepId;
  status: SddStepStatus;
  artifactPath?: string;
}

export interface SddWorkflowStatus {
  workspaceRoot: string;
  sddRoot: string;
  initialized: boolean;
  constitutionPath: string;
  constitutionExists: boolean;
  activeFeatureId: string | null;
  features: SddFeatureSummary[];
  steps: SddStepState[];
}

/** Canonical spec-kit steps (UI metadata; status comes from CLI). */
export const SDD_WORKFLOW_STEPS: SddWorkflowStepInfo[] = [
  { id: 'constitution', slashCommand: '/speckit.constitution', label: 'Constitution', description: 'Governing principles', phase: 'foundation', optional: false, requires: [] },
  { id: 'specify', slashCommand: '/speckit.specify', label: 'Specify', description: 'Requirements & user stories', phase: 'specification', optional: false, requires: ['constitution'] },
  { id: 'clarify', slashCommand: '/speckit.clarify', label: 'Clarify', description: 'Structured clarification', phase: 'specification', optional: true, requires: ['specify'] },
  { id: 'plan', slashCommand: '/speckit.plan', label: 'Plan', description: 'Technical implementation plan', phase: 'planning', optional: false, requires: ['specify'] },
  { id: 'tasks', slashCommand: '/speckit.tasks', label: 'Tasks', description: 'Actionable task breakdown', phase: 'planning', optional: false, requires: ['plan'] },
  { id: 'analyze', slashCommand: '/speckit.analyze', label: 'Analyze', description: 'Cross-artifact consistency', phase: 'quality', optional: true, requires: ['tasks'] },
  { id: 'checklist', slashCommand: '/speckit.checklist', label: 'Checklist', description: 'Requirements quality gates', phase: 'quality', optional: true, requires: ['specify'] },
  { id: 'implement', slashCommand: '/speckit.implement', label: 'Implement', description: 'Execute tasks in Agent mode', phase: 'execution', optional: false, requires: ['tasks'] },
  { id: 'taskstoissues', slashCommand: '/speckit.taskstoissues', label: 'Tasks → Issues', description: 'GitHub issues from tasks', phase: 'execution', optional: true, requires: ['tasks'] },
];

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
  agent: AgentSelectionId;
  specsDir?: string;
  /** Interaction mode — defaults to 'ask' */
  mode?: CopilotMode;
  /** Resolved spec file paths — populated by extension for spec+agent mode */
  specPaths?: string[];
  /** Provider model id (`auto` = provider default). */
  model?: string;
}

export interface ChatToolEventPayload {
  sessionId: string;
  tool: string;
  phase: 'before' | 'after' | 'terminal';
  path?: string;
  oldContent?: string | null;
  preview?: string;
  command?: string;
}

export interface LiveEditsPanelPayload {
  edits: LiveEditEntry[];
  canRevert: boolean;
  activePath?: string;
}

export interface LiveEditEntry {
  id: string;
  tool: string;
  path: string;
  phase: 'before' | 'after';
  preview?: string;
  beforeContent?: string | null;
  afterContent?: string;
  timestamp: number;
}

export interface ChatChunkPayload {
  sessionId: string;
  messageId: string;
  chunk: string;
  done: boolean;
}

export interface ChatAutoRoutedPayload {
  sessionId: string;
  agent: AgentId;
  ruleId: string;
  reason: string;
  fallbackUsed: boolean;
  scores: Record<AgentId, number>;
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
  | 'newChat'
  | 'showContext'
  | 'loadSpecs'
  | 'saveSpec'
  | 'deleteSpec'
  | 'openConfig'
  | 'openFile'
  | 'ready'
  // Chat streaming control
  | 'stopStream'
  | 'selectModel'
  | 'revertAgentChanges'
  | 'focusAgentTerminal'
  // Configuration wizard
  | 'saveSecret'
  | 'testConnection'
  | 'getSecretStatus'
  | 'saveSetting'
  | 'openChat'
  | 'openUserManual'
  | 'openSettingsJson'
  | 'openExtensionSettings'
  | 'initWorkspace'
  | 'getUsageStats'
  | 'resetUsageStats'
  | 'loadSddWorkflow'
  | 'initSddWorkflow'
  | 'createSddFeature'
  | 'writeSddArtifact'
  | 'runSddStep'
  | 'selectSddFeature'
  | 'openSddFile'
  | 'discoverSpecsRepo';

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
  | 'chatCleared'
  | 'specsLoaded'
  | 'specSaved'
  | 'agentChanged'
  | 'modeChanged'
  | 'initialize'
  | 'error'
  // Token usage (for status bar display)
  | 'tokenUsage'
  | 'streamStopped'
  | 'autoRouted'
  | 'liveEditsUpdated'
  | 'revertAvailable'
  | 'modelChanged'
  | 'liveEditsPanel'
  // Configuration wizard responses
  | 'configLoaded'
  | 'connectionResult'
  | 'secretStatus'
  | 'usageStats'
  | 'budgetAlert'
  | 'sddWorkflowLoaded'
  | 'sddWorkflowUpdated';

export interface ExtensionMessage<T = unknown> {
  command: ExtensionCommand;
  payload?: T;
}

export interface ProviderModelOption {
  id: string;
  label: string;
}

export interface InitializePayload {
  agent: AgentSelectionId;
  mode: CopilotMode;
  context: ContextItem[];
  history: ChatMessage[];
  agents: AgentDescriptor[];
  /** Last Auto routing decision for the active session (if any). */
  lastAutoRoute?: ChatAutoRoutedPayload;
  selectedModel: string;
  providerModels: Record<AgentId, ProviderModelOption[]>;
  liveEdits: LiveEditEntry[];
  canRevert: boolean;
}

export interface TokenUsagePayload {
  sessionTokens: number;
  dailyTokens: number;
  budgetTokens: number;
}

export interface AgentUsageTotals {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  tokensTotal: number;
  totalDurationMs: number;
}

export interface BudgetAlertPayload {
  level: 'warn' | 'exceeded';
  scope: 'total' | AgentId;
  message: string;
  current: number;
  limit: number;
  percent: number;
}

export interface UsageStatsPayload {
  updatedAt: string;
  firstRequestAt?: string;
  lastRequestAt?: string;
  total: AgentUsageTotals;
  byAgent: Record<AgentId, AgentUsageTotals>;
  alerts?: BudgetAlertPayload[];
  recent?: Array<{
    sessionId: string;
    agent: AgentId;
    at: string;
    tokensIn: number;
    tokensOut: number;
    tokensTotal: number;
    durationMs: number;
    mode?: string;
  }>;
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
