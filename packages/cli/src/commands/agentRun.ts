import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { AgentRouter } from '../router/AgentRouter.js';
import type { AgentId } from '../types.js';

interface AgentRunOptions {
  agent: AgentId;
  prompt: string;
  contextDirs?: string[];
  specsDir?: string;
  configFile?: string;
  stream?: boolean;
}

interface HarnessConfig {
  defaultAgent?: AgentId;
  connectors?: {
    copilot?: { token?: string; endpoint?: string };
    devin?: { apiKey?: string; endpoint?: string };
    cursor?: { apiKey?: string; endpoint?: string };
    claude?: { path?: string; apiKey?: string };
    kiro?: { apiKey?: string; endpoint?: string };
  };
}

/**
 * Execute a one-shot agent run from the CLI.
 * Reads configuration from `.harness/config.yaml` and environment variables.
 */
export async function agentRunCommand(options: AgentRunOptions): Promise<void> {
  const config = loadConfig(options.configFile);
  const agentConfig = buildAgentConfig(config);
  const router = new AgentRouter();

  const messages = [
    {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: options.prompt,
      timestamp: Date.now(),
    },
  ];

  const context = (options.contextDirs ?? []).flatMap((dir) => {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) {
      console.warn(`  Warning: context directory does not exist: ${resolved}`);
      return [];
    }
    return [{ uri: `file://${resolved}`, kind: 'directory' as const, label: dir }];
  });

  const agentId = options.agent ?? config.defaultAgent ?? 'copilot';
  console.log(`\nRunning agent: ${agentId}`);
  console.log(`Prompt: ${options.prompt.slice(0, 80)}${options.prompt.length > 80 ? '…' : ''}`);
  if (context.length > 0) {
    console.log(`Context: ${context.map((c) => c.label).join(', ')}`);
  }
  console.log('─'.repeat(60));

  await new Promise<void>((resolve, reject) => {
    router.route({
      sessionId: crypto.randomUUID(),
      messages,
      context,
      agent: agentId,
      config: agentConfig,
      onChunk: (chunk) => {
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

function loadConfig(configFile?: string): HarnessConfig {
  const candidates = [
    configFile,
    path.join(process.cwd(), '.harness', 'config.yaml'),
    path.join(process.cwd(), '.harness', 'config.yml'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const content = fs.readFileSync(candidate, 'utf-8');
      return (yaml.load(content) as HarnessConfig) ?? {};
    }
  }

  return {};
}

function buildAgentConfig(config: HarnessConfig) {
  const connectors = config.connectors ?? {};

  return {
    copilot: {
      token:
        connectors.copilot?.token ??
        process.env['GITHUB_TOKEN'] ??
        process.env['COPILOT_TOKEN'] ??
        '',
      endpoint: connectors.copilot?.endpoint ?? 'https://api.githubcopilot.com',
    },
    devin: {
      apiKey: connectors.devin?.apiKey ?? process.env['DEVIN_API_KEY'] ?? '',
      endpoint: connectors.devin?.endpoint ?? 'https://api.devin.ai/v1',
    },
    cursor: {
      apiKey: connectors.cursor?.apiKey ?? process.env['CURSOR_API_KEY'] ?? '',
      endpoint: connectors.cursor?.endpoint ?? '',
    },
    claude: {
      path: connectors.claude?.path ?? process.env['CLAUDE_PATH'] ?? 'claude',
      apiKey: connectors.claude?.apiKey ?? process.env['ANTHROPIC_API_KEY'],
    },
    kiro: {
      apiKey: connectors.kiro?.apiKey ?? process.env['KIRO_API_KEY'] ?? '',
      endpoint: connectors.kiro?.endpoint ?? '',
    },
  };
}
