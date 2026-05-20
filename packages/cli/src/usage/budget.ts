/**
 * Spending budgets and alert evaluation for `.harness/usage-stats.json`.
 */
import type { AgentId } from '../types.js';
import type { UsageStatsSnapshot } from './usageTracker.js';

export type BudgetAlertLevel = 'warn' | 'exceeded';

export interface BudgetAlert {
  level: BudgetAlertLevel;
  scope: 'total' | AgentId;
  message: string;
  current: number;
  limit: number;
  percent: number;
}

export interface SpendingBudgetSettings {
  enabled: boolean;
  /** 0 = no global cap */
  totalTokens: number;
  /** Per-agent caps; 0 omits that agent */
  byAgent: Partial<Record<AgentId, number>>;
  /** Warn when usage reaches this % of limit (default 80) */
  warnPercent: number;
}

export const DEFAULT_SPENDING_BUDGET: SpendingBudgetSettings = {
  enabled: false,
  totalTokens: 0,
  byAgent: {},
  warnPercent: 80,
};

const AGENTS: AgentId[] = ['copilot', 'devin', 'cursor', 'claude', 'kiro'];

export function loadSpendingBudgetFromBridge(
  bridge?: {
    spending?: {
      budgetEnabled?: boolean;
      budgetTotalTokens?: number;
      budgetWarnPercent?: number;
      budgetTokensByAgent?: Partial<Record<AgentId, number>>;
    };
  },
): SpendingBudgetSettings {
  const s = bridge?.spending ?? {};
  return {
    enabled: s.budgetEnabled === true,
    totalTokens: Math.max(0, s.budgetTotalTokens ?? 0),
    warnPercent: Math.min(100, Math.max(1, s.budgetWarnPercent ?? 80)),
    byAgent: s.budgetTokensByAgent ?? {},
  };
}

export function evaluateBudgetAlerts(
  stats: UsageStatsSnapshot,
  budget: SpendingBudgetSettings,
): BudgetAlert[] {
  if (!budget.enabled) {
    return [];
  }

  const alerts: BudgetAlert[] = [];

  function check(scope: 'total' | AgentId, current: number, limit: number): void {
    if (!limit || limit <= 0) {
      return;
    }
    const percent = Math.round((current / limit) * 100);
    if (current >= limit) {
      alerts.push({
        level: 'exceeded',
        scope,
        current,
        limit,
        percent,
        message:
          scope === 'total'
            ? `Total token budget exceeded (${current.toLocaleString()} / ${limit.toLocaleString()}).`
            : `${scope} token budget exceeded (${current.toLocaleString()} / ${limit.toLocaleString()}).`,
      });
    } else if (percent >= budget.warnPercent) {
      alerts.push({
        level: 'warn',
        scope,
        current,
        limit,
        percent,
        message:
          scope === 'total'
            ? `Total tokens at ${percent}% of budget (${current.toLocaleString()} / ${limit.toLocaleString()}).`
            : `${scope} tokens at ${percent}% of budget (${current.toLocaleString()} / ${limit.toLocaleString()}).`,
      });
    }
  }

  check('total', stats.total.tokensTotal, budget.totalTokens);

  for (const agent of AGENTS) {
    const limit = budget.byAgent[agent];
    if (limit && limit > 0) {
      check(agent, stats.byAgent[agent]?.tokensTotal ?? 0, limit);
    }
  }

  return alerts;
}
