/**
 * Provider-agnostic prompt guidance for token efficiency and consistent answers.
 * Injected as a system message when `promptOptimization` is enabled (default).
 */
import type { ChatMessage, CopilotMode } from '../types.js';

export interface PromptOptimizationSettings {
  enabled: boolean;
  maxContextCharsPerFile: number;
  maxHistoryMessages: number;
}

export const DEFAULT_PROMPT_OPTIMIZATION: PromptOptimizationSettings = {
  enabled: true,
  maxContextCharsPerFile: 12_000,
  maxHistoryMessages: 24,
};

const EFFICIENCY_PREAMBLE = `You are assisting through Harness (multi-provider orchestrator).

Response rules (all providers):
- Be direct: answer the question first, then optional detail.
- Prefer bullet lists over long paragraphs when listing items.
- Do not repeat the user's question or restate obvious context.
- For code: minimal diff or snippet; avoid dumping whole files unless asked.
- If scope is unclear, ask one short clarifying question instead of guessing.
- Do not narrate your process ("I will now…") unless the user asks for a plan.`;

const MODE_HINTS: Record<CopilotMode, string> = {
  ask: 'Mode: Q&A — no file edits unless explicitly requested.',
  agent: 'Mode: implementation — make focused changes; cite paths you touch.',
  'spec+agent':
    'Mode: spec-driven — follow active Harness specs; satisfy acceptance criteria before extras.',
};

export function loadPromptOptimizationFromBridge(
  bridge?: {
    promptOptimization?: Partial<PromptOptimizationSettings>;
  },
): PromptOptimizationSettings {
  const p = bridge?.promptOptimization ?? {};
  return {
    enabled: p.enabled !== false,
    maxContextCharsPerFile: p.maxContextCharsPerFile ?? DEFAULT_PROMPT_OPTIMIZATION.maxContextCharsPerFile,
    maxHistoryMessages: p.maxHistoryMessages ?? DEFAULT_PROMPT_OPTIMIZATION.maxHistoryMessages,
  };
}

export function buildHarnessSystemGuidance(mode?: CopilotMode): string {
  const m = mode ?? 'ask';
  return `${EFFICIENCY_PREAMBLE}\n\n${MODE_HINTS[m]}`;
}

/** Trim history to recent turns to limit prompt size. */
export function trimMessageHistory(
  messages: ChatMessage[],
  maxMessages: number,
): ChatMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }
  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const keep = nonSystem.slice(-maxMessages);
  return [...system, ...keep];
}

export function truncateFileContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  const head = Math.floor(maxChars * 0.85);
  const tail = maxChars - head - 80;
  return (
    content.slice(0, head) +
    `\n\n… [Harness: ${content.length - head - tail} chars omitted for token budget] …\n\n` +
    content.slice(-tail)
  );
}

export function applyContextTruncation(
  files: Array<{ path: string; content: string }>,
  maxCharsPerFile: number,
): Array<{ path: string; content: string }> {
  return files.map(({ path, content }) => ({
    path,
    content: truncateFileContent(content, maxCharsPerFile),
  }));
}

/**
 * Prepend Harness guidance and trim history when optimization is on.
 * Skips duplicate guidance if already present.
 */
export function optimizeMessagesForRouting(
  messages: ChatMessage[],
  settings: PromptOptimizationSettings,
  mode?: CopilotMode,
): ChatMessage[] {
  let out = [...messages];

  if (settings.enabled) {
    const guidance = buildHarnessSystemGuidance(mode);
    const hasGuidance = out.some(
      (m) => m.role === 'system' && m.content.includes('assisting through Harness'),
    );
    if (!hasGuidance) {
      out.unshift({
        id: crypto.randomUUID(),
        role: 'system',
        content: guidance,
        timestamp: Date.now(),
      });
    }
    out = trimMessageHistory(out, settings.maxHistoryMessages);
  }

  return out;
}
