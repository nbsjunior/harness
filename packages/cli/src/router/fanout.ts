/**
 * Multi-agent parallel execution (fan-out) — one prompt, many providers.
 */
import type { AgentId, AgentRequest, ChatMessage } from '../types.js';
import type { AgentRouter } from './AgentRouter.js';

export interface FanoutAgentResult {
  agent: AgentId;
  ok: boolean;
  text: string;
  error?: string;
  durationMs: number;
}

export interface FanoutRequest {
  sessionId: string;
  prompt: string;
  agents: AgentId[];
  baseRequest: Omit<AgentRequest, 'messages' | 'agent' | 'onChunk' | 'onDone' | 'onError'>;
}

export async function runAgentFanout(
  router: AgentRouter,
  req: FanoutRequest,
): Promise<FanoutAgentResult[]> {
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: req.prompt,
    timestamp: Date.now(),
  };

  const tasks = req.agents.map(async (agent): Promise<FanoutAgentResult> => {
    const started = Date.now();
    let text = '';
    let error: string | undefined;

    try {
      await router.route({
        ...req.baseRequest,
        sessionId: `${req.sessionId}:${agent}`,
        agent,
        messages: [userMessage],
        onChunk: (chunk) => {
          text += chunk;
        },
        onDone: () => {},
        onError: (err) => {
          error = err;
        },
      });
    } catch (err) {
      error = (err as Error).message;
    }

    return {
      agent,
      ok: !error,
      text: text.trim(),
      error,
      durationMs: Date.now() - started,
    };
  });

  return Promise.all(tasks);
}

export function formatFanoutMarkdown(results: FanoutAgentResult[]): string {
  const parts = ['**[Todd fan-out]** Parallel agent results\n'];
  for (const r of results) {
    parts.push(`\n### ${r.agent}${r.ok ? '' : ' (failed)'}\n`);
    if (r.error) {
      parts.push(`_${r.error}_\n`);
    } else if (r.text) {
      parts.push(`${r.text}\n`);
    } else {
      parts.push('_No text response._\n');
    }
    parts.push(`_${r.durationMs}ms_\n`);
  }
  return parts.join('');
}
