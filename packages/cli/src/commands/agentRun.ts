import * as path from 'path';
import { AgentRouter } from '../router/AgentRouter.js';
import { loadAgentConfig } from '../config.js';
import type { AgentId } from '../types.js';

interface AgentRunOptions {
  agent: AgentId;
  prompt: string;
  contextDirs?: string[];
  specsDir?: string;
  configFile?: string;
}

/**
 * Execute a one-shot agent run from the CLI (non-IPC, interactive mode).
 * Progress headers go to stderr; agent response goes to stdout.
 */
export async function agentRunCommand(options: AgentRunOptions): Promise<void> {
  const agentConfig = loadAgentConfig(options.specsDir);
  const router = new AgentRouter();

  const messages = [
    {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: options.prompt,
      timestamp: Date.now(),
    },
  ];

  const context = (options.contextDirs ?? []).map((dir) => ({
    absolutePath: path.resolve(dir),
    kind: 'directory' as const,
    label: dir,
  }));

  const agentId = options.agent;

  // Progress info to stderr (never stdout — that must stay clean for piping)
  process.stderr.write(`\nAgent: ${agentId}\n`);
  process.stderr.write(`Prompt: ${options.prompt.slice(0, 80)}${options.prompt.length > 80 ? '…' : ''}\n`);
  if (context.length > 0) {
    process.stderr.write(`Context: ${context.map((c) => c.label).join(', ')}\n`);
  }
  process.stderr.write('─'.repeat(60) + '\n');

  await new Promise<void>((resolve, reject) => {
    router.route({
      sessionId: crypto.randomUUID(),
      messages,
      context,
      agent: agentId,
      config: agentConfig,
      onChunk: (chunk) => {
        // Agent response goes to stdout — safe for piping
        process.stdout.write(chunk);
      },
      onDone: () => {
        process.stdout.write('\n');
        resolve();
      },
      onError: (err) => {
        reject(new Error(err));
      },
    });
  });
}
