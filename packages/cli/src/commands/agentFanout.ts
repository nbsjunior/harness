import { AgentRouter } from '../router/AgentRouter.js';
import { formatFanoutMarkdown, runAgentFanout } from '../router/fanout.js';
import { loadAgentConfig } from '../config.js';
import type { AgentId, AgentSelectionId } from '../types.js';

const VALID: AgentId[] = ['copilot', 'devin', 'cursor', 'claude', 'kiro'];

export async function agentFanoutCommand(options: {
  agents: string;
  prompt: string;
  mode?: string;
}): Promise<void> {
  const agents = options.agents
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean) as AgentId[];

  for (const a of agents) {
    if (!VALID.includes(a)) {
      throw new Error(`Invalid agent "${a}". Use: ${VALID.join(', ')}`);
    }
  }

  const router = new AgentRouter();
  const config = loadAgentConfig();
  const sessionId = crypto.randomUUID();

  const results = await runAgentFanout(router, {
    sessionId,
    prompt: options.prompt,
    agents,
    baseRequest: {
      sessionId,
      messages: [],
      context: [],
      agent: 'copilot' as AgentSelectionId,
      config,
      mode: (options.mode as 'ask' | 'agent' | 'spec+agent') ?? 'ask',
    },
  });

  process.stdout.write(formatFanoutMarkdown(results));
}
