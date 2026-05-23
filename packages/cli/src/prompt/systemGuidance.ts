/**
 * Provider-agnostic prompt guidance for token efficiency and consistent answers.
 * Injected as a system message when `promptOptimization` is enabled (default).
 */
import type { ChatMessage, CopilotMode } from '../types.js';
import {
  applyPromptEngineeringPipeline,
  augmentGuidanceForMode,
} from './promptOptimizer.js';

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

const EFFICIENCY_PREAMBLE = `You are assisting through ToddSpect (multi-provider orchestrator).

## Response contract
- Answer the user’s goal first; supporting detail second.
- Use bullets for lists; short paragraphs otherwise.
- Do not repeat the question or restate attached context verbatim.
- Code: minimal diff/snippet; cite paths; no full-file dumps unless requested.
- One clarifying question if blocked — do not guess on security or data loss.
- Skip process narration ("I will now…") unless the user asks for a plan.

## Prompt engineering (internal)
- Decompose complex work into verifiable steps.
- State constraints and output format explicitly when ambiguous.
- Prefer negative constraints ("do not change X") for fragile areas.
- Self-check requirements, types, and tests before finishing.`;

const MODE_HINTS: Record<CopilotMode, string> = {
  ask: 'Mode: Q&A — no file edits unless explicitly requested.',
  agent: 'Mode: implementation — make focused changes; cite paths you touch.',
  'spec+agent':
    'Mode: spec-driven — follow active ToddSpect specs; satisfy acceptance criteria before extras.',
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

export function buildToddSpectSystemGuidance(mode?: CopilotMode): string {
  const m = mode ?? 'ask';
  return augmentGuidanceForMode(`${EFFICIENCY_PREAMBLE}\n\n${MODE_HINTS[m]}`, m);
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
    `\n\n… [ToddSpect: ${content.length - head - tail} chars omitted for token budget] …\n\n` +
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
 * Prepend ToddSpect guidance and trim history when optimization is on.
 * Skips duplicate guidance if already present.
 */
export function optimizeMessagesForRouting(
  messages: ChatMessage[],
  settings: PromptOptimizationSettings,
  mode?: CopilotMode,
): ChatMessage[] {
  let out = [...messages];

  if (settings.enabled) {
    out = applyPromptEngineeringPipeline(out, mode);

    const guidance = buildToddSpectSystemGuidance(mode);
    const hasGuidance = out.some(
      (m) => m.role === 'system' && m.content.includes('assisting through ToddSpect'),
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
