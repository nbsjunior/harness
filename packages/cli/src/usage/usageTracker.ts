/**
 * Workspace-local usage / spending stats (.toddspect/usage-stats.json).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AgentId } from '../types.js';

export interface AgentUsageTotals {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  tokensTotal: number;
  totalDurationMs: number;
}

export interface UsageStatsSnapshot {
  updatedAt: string;
  firstRequestAt?: string;
  lastRequestAt?: string;
  total: AgentUsageTotals;
  byAgent: Record<AgentId, AgentUsageTotals>;
  /** Last 50 chat turns for the Spending UI */
  recent: Array<{
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

const AGENTS: AgentId[] = ['copilot', 'devin', 'cursor', 'claude', 'kiro'];

function emptyTotals(): AgentUsageTotals {
  return { requests: 0, tokensIn: 0, tokensOut: 0, tokensTotal: 0, totalDurationMs: 0 };
}

function emptyByAgent(): Record<AgentId, AgentUsageTotals> {
  return Object.fromEntries(AGENTS.map((a) => [a, emptyTotals()])) as Record<AgentId, AgentUsageTotals>;
}

/** ~4 characters per token (English/code heuristic). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function usageStatsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.toddspect', 'usage-stats.json');
}

export function loadUsageStats(workspaceRoot: string): UsageStatsSnapshot {
  const filePath = usageStatsPath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return {
      updatedAt: new Date().toISOString(),
      total: emptyTotals(),
      byAgent: emptyByAgent(),
      recent: [],
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UsageStatsSnapshot;
    return {
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      firstRequestAt: raw.firstRequestAt,
      lastRequestAt: raw.lastRequestAt,
      total: { ...emptyTotals(), ...raw.total },
      byAgent: { ...emptyByAgent(), ...raw.byAgent },
      recent: Array.isArray(raw.recent) ? raw.recent : [],
    };
  } catch {
    return {
      updatedAt: new Date().toISOString(),
      total: emptyTotals(),
      byAgent: emptyByAgent(),
      recent: [],
    };
  }
}

function saveUsageStats(workspaceRoot: string, stats: UsageStatsSnapshot): void {
  const dir = path.join(workspaceRoot, '.toddspect');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(usageStatsPath(workspaceRoot), JSON.stringify(stats, null, 2), 'utf-8');
}

export function recordChatUsage(params: {
  workspaceRoot: string;
  sessionId: string;
  agent: AgentId;
  inputText: string;
  outputText: string;
  durationMs: number;
  mode?: string;
}): UsageStatsSnapshot {
  const stats = loadUsageStats(params.workspaceRoot);
  const now = new Date().toISOString();
  const tokensIn = estimateTokens(params.inputText);
  const tokensOut = estimateTokens(params.outputText);
  const tokensTotal = tokensIn + tokensOut;

  const bump = (bucket: AgentUsageTotals) => {
    bucket.requests += 1;
    bucket.tokensIn += tokensIn;
    bucket.tokensOut += tokensOut;
    bucket.tokensTotal += tokensTotal;
    bucket.totalDurationMs += params.durationMs;
  };

  bump(stats.total);
  bump(stats.byAgent[params.agent] ?? (stats.byAgent[params.agent] = emptyTotals()));

  stats.updatedAt = now;
  if (!stats.firstRequestAt) {
    stats.firstRequestAt = now;
  }
  stats.lastRequestAt = now;

  stats.recent.unshift({
    sessionId: params.sessionId,
    agent: params.agent,
    at: now,
    tokensIn,
    tokensOut,
    tokensTotal,
    durationMs: params.durationMs,
    mode: params.mode,
  });
  stats.recent = stats.recent.slice(0, 50);

  saveUsageStats(params.workspaceRoot, stats);
  return stats;
}

export function resetUsageStats(workspaceRoot: string): UsageStatsSnapshot {
  const stats: UsageStatsSnapshot = {
    updatedAt: new Date().toISOString(),
    total: emptyTotals(),
    byAgent: emptyByAgent(),
    recent: [],
  };
  saveUsageStats(workspaceRoot, stats);
  return stats;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const mrem = min % 60;
  return mrem > 0 ? `${hr}h ${mrem}m` : `${hr}h`;
}
