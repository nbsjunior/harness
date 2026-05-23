/**
 * Prompt engineering helpers — normalize, dedupe, and structure messages before routing.
 */
import type { ChatMessage, CopilotMode } from '../types.js';

/** Collapse excessive whitespace without changing code fences. */
export function normalizeMessageContent(text: string): string {
  let out = text.replace(/\r\n/g, '\n');
  out = out.replace(/[ \t]+$/gm, '');
  out = out.replace(/\n{4,}/g, '\n\n\n');
  return out.trim();
}

/** Remove consecutive duplicate user messages (exact match after normalize). */
export function dedupeConsecutiveUserMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let lastUser = '';

  for (const m of messages) {
    if (m.role === 'user') {
      const body = normalizeMessageContent(m.content);
      if (body && body === lastUser) {
        continue;
      }
      lastUser = body;
      out.push(body === m.content ? m : { ...m, content: body });
    } else {
      out.push(m);
      if (m.role === 'assistant') {
        lastUser = '';
      }
    }
  }
  return out;
}

/** Drop empty assistant placeholders from history. */
export function pruneEmptyAssistantTurns(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (m) => m.role !== 'assistant' || normalizeMessageContent(m.content).length > 0,
  );
}

/** Merge multiple ToddSpect guidance system messages into one block. */
export function mergeToddSpectSystemGuidance(messages: ChatMessage[]): ChatMessage[] {
  const guidanceParts: string[] = [];
  const rest: ChatMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system' && m.content.includes('assisting through ToddSpect')) {
      guidanceParts.push(normalizeMessageContent(m.content));
    } else {
      rest.push(m);
    }
  }

  if (guidanceParts.length <= 1) {
    return messages;
  }

  const merged = [...new Set(guidanceParts)].join('\n\n');
  const firstIdx = messages.findIndex(
    (m) => m.role === 'system' && m.content.includes('assisting through ToddSpect'),
  );
  const mergedMsg: ChatMessage = {
    id: messages[firstIdx]?.id ?? crypto.randomUUID(),
    role: 'system',
    content: merged,
    timestamp: messages[firstIdx]?.timestamp ?? Date.now(),
  };

  let inserted = false;
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system' && m.content.includes('assisting through ToddSpect')) {
      if (!inserted) {
        out.push(mergedMsg);
        inserted = true;
      }
      continue;
    }
    out.push(m);
  }
  return out;
}

const AGENT_COT_HINT = `For multi-step implementation:
- Outline a short plan (3–6 bullets) before editing files.
- Execute in small verifiable steps; prefer minimal diffs.
- After changes, self-check: requirements, types, security, tests.`;

const SPEC_AGENT_HINT = `Active ToddSpect specs are authoritative. Satisfy their acceptance criteria before optional improvements.`;

export function augmentGuidanceForMode(base: string, mode?: CopilotMode): string {
  const m = mode ?? 'ask';
  const parts = [base];
  if (m === 'agent') {
    parts.push(AGENT_COT_HINT);
  }
  if (m === 'spec+agent') {
    parts.push(SPEC_AGENT_HINT);
  }
  return parts.join('\n\n');
}

/**
 * Full optimization pipeline (after settings.enabled check).
 * Order: normalize → dedupe → prune → merge system guidance.
 */
export function applyPromptEngineeringPipeline(
  messages: ChatMessage[],
  mode?: CopilotMode,
): ChatMessage[] {
  let out = messages.map((m) => ({
    ...m,
    content: normalizeMessageContent(m.content),
  }));
  out = dedupeConsecutiveUserMessages(out);
  out = pruneEmptyAssistantTurns(out);
  out = mergeToddSpectSystemGuidance(out);
  return out;
}
