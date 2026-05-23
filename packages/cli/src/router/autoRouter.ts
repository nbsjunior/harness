/**
 * @module router/autoRouter
 * **ToddSpect Auto provider** — selects the best `AgentId` from the user prompt and session signals.
 *
 * ## Algorithm (v1)
 *
 * 1. **Score** each routable agent using keyword/signal rules (see `AUTO_ROUTING_RULES` below).
 * 2. Add **mode bonuses** (e.g. `spec+agent` → Kiro, many context files → Cursor).
 * 3. Pick the agent with the highest score; ties break by rule priority (table order).
 * 4. If the winner is **not ready** (`checkAgentReadiness`), walk the global fallback chain:
 *    `copilot` → `claude` → `cursor` → `devin` → `kiro` (first ready wins).
 * 5. If nothing is ready, still return `copilot` so the user gets a clear configuration hint.
 *
 * ## Routing table (design rationale)
 *
 * Based on public positioning and typical strengths (2024–2026):
 *
 * | Agent   | Best for |
 * |---------|----------|
 * | Copilot | Default Q&A, GitHub/PR workflow, quick explanations — lowest friction when unsure |
 * | Claude  | Complex refactors, architecture, integrations (APIs, OAuth, webhooks), security/perf |
 * | Cursor  | Multi-file repo work, cloud agent tasks, large selected context |
 * | Devin   | Long-horizon autonomous implementation (“build end-to-end”, ship feature) |
 * | Kiro    | Spec-driven / AI-DLC / `.kiro` steering / ToddSpect `spec+agent` mode |
 *
 * @see docs/auto-routing.md — full documentation for users and contributors
 */
import type { AgentConnectorConfig } from '../config.js';
import type { AgentId, CopilotMode } from '../types.js';
import { checkAgentReadiness } from './agentReadiness.js';

/** User-facing selection includes Auto; routing always resolves to a concrete `AgentId`. */
export type AgentSelectionId = AgentId | 'auto';

/** Routable agents in fallback order when the preferred choice is not configured. */
export const AUTO_FALLBACK_CHAIN: AgentId[] = [
  'copilot',
  'claude',
  'cursor',
  'devin',
  'kiro',
];

/**
 * Keyword/signal rules. Higher `priority` wins ties when scores are equal.
 * `weight` is added per matched signal (substring in normalized prompt).
 */
export const AUTO_ROUTING_RULES: ReadonlyArray<{
  id: string;
  agent: AgentId;
  priority: number;
  weight: number;
  signals: readonly string[];
  description: string;
}> = [
  {
    id: 'spec-driven',
    agent: 'kiro',
    priority: 100,
    weight: 12,
    signals: [
      'aidlc',
      'ai-dlc',
      'ai dlc',
      'steering',
      '.kiro',
      'toddspect spec',
      'spec-driven',
      'sdd',
      'workflow spec',
    ],
    description: 'Spec-driven development and AI-DLC steering',
  },
  {
    id: 'autonomous-engineering',
    agent: 'devin',
    priority: 95,
    weight: 10,
    signals: [
      'autonomous',
      'end to end',
      'end-to-end',
      'ship feature',
      'implement entire',
      'full implementation',
      'build the feature',
      'complete the task',
      'without my help',
    ],
    description: 'Long-horizon autonomous engineering tasks',
  },
  {
    id: 'complex-code',
    agent: 'claude',
    priority: 90,
    weight: 10,
    signals: [
      'refactor',
      'architecture',
      'architect',
      'design pattern',
      'solid',
      'complex',
      'algorithm',
      'performance',
      'optimize',
      'security audit',
      'migrate',
      'migration',
      'legacy code',
      'deep dive',
    ],
    description: 'Complex code, architecture, and deep reasoning',
  },
  {
    id: 'integrations',
    agent: 'claude',
    priority: 88,
    weight: 9,
    signals: [
      'integrate',
      'integration',
      'webhook',
      'oauth',
      'openid',
      'graphql',
      'rest api',
      'grpc',
      'sdk',
      'third-party',
      'third party',
      'stripe',
      'twilio',
      'slack api',
    ],
    description: 'API and third-party integrations',
  },
  {
    id: 'repo-wide',
    agent: 'cursor',
    priority: 82,
    weight: 8,
    signals: [
      'codebase',
      'across files',
      'all files',
      'find all usages',
      'rename symbol',
      'multi-file',
      'multifile',
      'monorepo',
      'workspace-wide',
    ],
    description: 'Repository-wide edits and navigation',
  },
  {
    id: 'cloud-agent',
    agent: 'cursor',
    priority: 78,
    weight: 7,
    signals: ['cloud agent', 'cursor cloud', 'cursor agent'],
    description: 'Cursor Cloud Agents workflows',
  },
  {
    id: 'github-copilot',
    agent: 'copilot',
    priority: 70,
    weight: 6,
    signals: [
      'pull request',
      'pr review',
      'github issue',
      'copilot',
      'gh actions',
      'github actions',
      'commit message',
    ],
    description: 'GitHub-centric workflows',
  },
  {
    id: 'quick-qa',
    agent: 'copilot',
    priority: 50,
    weight: 4,
    signals: [
      'explain',
      'what is',
      'what does',
      'how do i',
      'how to',
      'documentation',
      'summarize',
      'summary of',
    ],
    description: 'Quick questions and explanations',
  },
] as const;

export interface AutoRouteInput {
  /** Latest user message text (required for scoring). */
  prompt: string;
  mode?: CopilotMode;
  /** Number of context paths attached to the turn. */
  contextCount?: number;
  /** Number of spec files injected (`spec+agent`). */
  specCount?: number;
  config: AgentConnectorConfig;
}

export interface AutoRouteResult {
  agent: AgentId;
  ruleId: string;
  reason: string;
  scores: Record<AgentId, number>;
  /** True when the top-scoring agent was unavailable and fallback chain was used. */
  fallbackUsed: boolean;
  requestedFallbackFrom?: AgentId;
}

function normalizePrompt(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function emptyScores(): Record<AgentId, number> {
  return { copilot: 0, devin: 0, cursor: 0, claude: 0, kiro: 0 };
}

/** Mode/context bonuses applied on top of keyword scores. */
function applyModeBonuses(
  scores: Record<AgentId, number>,
  input: AutoRouteInput,
): void {
  const mode = input.mode ?? 'ask';
  const ctx = input.contextCount ?? 0;
  const specs = input.specCount ?? 0;

  if (mode === 'spec+agent' || specs > 0) {
    scores.kiro += 25;
  }
  if (mode === 'agent') {
    scores.copilot += 3;
    if (ctx >= 5) {
      scores.cursor += 15;
    } else if (ctx >= 2) {
      scores.cursor += 8;
    } else {
      // Agent mode without much context — prefer Cursor cloud over Devin when scoring
      scores.cursor += 6;
    }
    const len = input.prompt.length;
    if (len > 400) {
      scores.claude += 8;
      // Devin only when prompt signals long-horizon work (see autonomous-engineering rule)
      scores.devin += 4;
    }
  }
}

/**
 * Score agents from prompt keywords and session signals. Does not check readiness.
 */
export function scoreAutoAgents(input: AutoRouteInput): {
  scores: Record<AgentId, number>;
  winningRuleId: string;
  winningReason: string;
} {
  const scores = emptyScores();
  const normalized = normalizePrompt(input.prompt);

  applyModeBonuses(scores, input);

  const matchedRules: Array<{
    rule: (typeof AUTO_ROUTING_RULES)[number];
    hits: number;
  }> = [];

  for (const rule of AUTO_ROUTING_RULES) {
    let hits = 0;
    for (const signal of rule.signals) {
      if (normalized.includes(signal)) {
        hits += 1;
      }
    }
    if (hits > 0) {
      scores[rule.agent] += rule.weight * hits;
      matchedRules.push({ rule, hits });
    }
  }

  const topAgent = (Object.keys(scores) as AgentId[]).reduce((a, b) =>
    scores[b] > scores[a] ? b : a,
  );

  // Default: Copilot when no keyword matched
  if (matchedRules.length === 0 || scores[topAgent] === 0) {
    scores.copilot += 5;
    return {
      scores,
      winningRuleId: 'default-copilot',
      winningReason:
        'No strong task signal — using GitHub Copilot as the default (fast Q&A and general coding).',
    };
  }

  const bestForWinner = matchedRules
    .filter((m) => m.rule.agent === topAgent)
    .sort((a, b) => b.rule.priority - a.rule.priority || b.hits - a.hits)[0];

  const matchedRule =
    bestForWinner?.rule ??
    matchedRules.sort((a, b) => b.rule.priority - a.rule.priority)[0].rule;

  return {
    scores,
    winningRuleId: matchedRule.id,
    winningReason: `${matchedRule.description} → ${labelAgent(topAgent)}`,
  };
}

function labelAgent(agent: AgentId): string {
  const labels: Record<AgentId, string> = {
    copilot: 'GitHub Copilot',
    devin: 'Devin',
    cursor: 'Cursor AI',
    claude: 'Claude Code',
    kiro: 'Kiro (AI-DLC)',
  };
  return labels[agent];
}

/**
 * Resolve `auto` (or run scoring when selection is auto) to a concrete ready agent.
 */
export function resolveAutoAgent(input: AutoRouteInput): AutoRouteResult {
  const { scores, winningRuleId, winningReason } = scoreAutoAgents(input);

  const ranked = (Object.keys(scores) as AgentId[]).sort((a, b) => scores[b] - scores[a]);
  const topScored = ranked[0];
  const readyRanked = ranked.filter((a) => checkAgentReadiness(a, input.config).ready);

  if (readyRanked.length > 0) {
    const agent = readyRanked[0];
    const fallbackUsed = agent !== topScored;
    return {
      agent,
      ruleId: winningRuleId,
      reason: fallbackUsed
        ? `${winningReason} (${labelAgent(topScored)} not configured — using ${labelAgent(agent)}).`
        : winningReason,
      scores,
      fallbackUsed,
      ...(fallbackUsed ? { requestedFallbackFrom: topScored } : {}),
    };
  }

  return {
    agent: 'copilot',
    ruleId: winningRuleId,
    reason:
      `${winningReason} (no agent configured — run toddspect check getGoat; configure Cursor, Copilot, etc.).`,
    scores,
    fallbackUsed: true,
    requestedFallbackFrom: topScored,
  };
}

export function isAutoSelection(agent: AgentSelectionId): agent is 'auto' {
  return agent === 'auto';
}

export function resolveAgentSelection(
  selection: AgentSelectionId,
  input: Omit<AutoRouteInput, 'config'> & { config: AgentConnectorConfig },
): { agent: AgentId; auto?: AutoRouteResult } {
  if (!isAutoSelection(selection)) {
    return { agent: selection };
  }
  const auto = resolveAutoAgent(input);
  return { agent: auto.agent, auto };
}
