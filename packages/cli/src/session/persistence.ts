/**
 * Persist chat session to `.toddspect/chat-session.json` (survives VS Code restart).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AgentSelectionId, ChatMessage, CopilotMode } from '../types.js';
import { getWorkspaceRoot } from '../config.js';

export const CHAT_SESSION_VERSION = 1;

export interface PersistedChatSession {
  version: typeof CHAT_SESSION_VERSION;
  updatedAt: string;
  sessionId: string;
  selectedAgent: AgentSelectionId;
  selectedMode: CopilotMode;
  model?: string;
  messages: ChatMessage[];
  contextPaths: string[];
}

export function chatSessionPath(workspaceRoot?: string): string {
  return path.join(workspaceRoot ?? getWorkspaceRoot(), '.toddspect', 'chat-session.json');
}

export function loadChatSession(workspaceRoot?: string): PersistedChatSession | null {
  const filePath = chatSessionPath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PersistedChatSession;
    if (!raw || raw.version !== CHAT_SESSION_VERSION || !Array.isArray(raw.messages)) {
      return null;
    }
    return {
      version: CHAT_SESSION_VERSION,
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      sessionId: raw.sessionId ?? crypto.randomUUID(),
      selectedAgent: raw.selectedAgent ?? 'auto',
      selectedMode: raw.selectedMode ?? 'ask',
      model: raw.model,
      messages: raw.messages.filter((m) => m?.role && typeof m.content === 'string'),
      contextPaths: Array.isArray(raw.contextPaths) ? raw.contextPaths : [],
    };
  } catch {
    return null;
  }
}

export function saveChatSession(
  data: Omit<PersistedChatSession, 'version' | 'updatedAt'>,
  workspaceRoot?: string,
): PersistedChatSession {
  const root = workspaceRoot ?? getWorkspaceRoot();
  const dir = path.join(root, '.toddspect');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const snapshot: PersistedChatSession = {
    version: CHAT_SESSION_VERSION,
    updatedAt: new Date().toISOString(),
    ...data,
    messages: data.messages.filter((m) => !(m as { streaming?: boolean }).streaming),
  };
  fs.writeFileSync(chatSessionPath(root), JSON.stringify(snapshot, null, 2), 'utf-8');
  return snapshot;
}

export function clearChatSession(workspaceRoot?: string): void {
  const filePath = chatSessionPath(workspaceRoot);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
