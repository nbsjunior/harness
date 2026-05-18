import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { AgentId } from './types.js';

export interface AgentConnectorConfig {
  copilot: { token: string; endpoint: string };
  devin: { apiKey: string; endpoint: string };
  cursor: { apiKey: string; endpoint: string };
  claude: { path: string; apiKey?: string };
  kiro: { apiKey: string; endpoint: string };
}

interface HarnessConfigFile {
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
 * Load and merge agent connector configuration from:
 *  1. `.harness/config.yaml` in the workspace root
 *  2. Environment variables (override config file values)
 */
export function loadAgentConfig(specsDir?: string): AgentConnectorConfig {
  const candidates: string[] = [];

  if (specsDir) {
    candidates.push(path.join(specsDir, '..', 'config.yaml'));
  }

  const workspace = process.env['HARNESS_WORKSPACE'] ?? process.cwd();
  candidates.push(
    path.join(workspace, '.harness', 'config.yaml'),
    path.join(workspace, '.harness', 'config.yml'),
  );

  let fileConfig: HarnessConfigFile = {};

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        fileConfig = (yaml.load(fs.readFileSync(candidate, 'utf-8')) as HarnessConfigFile) ?? {};
        process.stderr.write(`[harness-cli] Loaded config from: ${candidate}\n`);
      } catch (err) {
        process.stderr.write(`[harness-cli] Failed to parse config at ${candidate}: ${(err as Error).message}\n`);
      }
      break;
    }
  }

  const c = fileConfig.connectors ?? {};

  return {
    copilot: {
      token:
        c.copilot?.token ??
        process.env['COPILOT_GITHUB_TOKEN'] ??
        process.env['GH_TOKEN'] ??
        process.env['GITHUB_TOKEN'] ??
        process.env['COPILOT_TOKEN'] ??
        '',
      endpoint: c.copilot?.endpoint ?? 'https://api.githubcopilot.com',
    },
    devin: {
      apiKey: c.devin?.apiKey ?? process.env['DEVIN_API_KEY'] ?? '',
      endpoint: c.devin?.endpoint ?? 'https://api.devin.ai/v1',
    },
    cursor: {
      apiKey: c.cursor?.apiKey ?? process.env['CURSOR_API_KEY'] ?? '',
      endpoint: c.cursor?.endpoint ?? '',
    },
    claude: {
      path: c.claude?.path ?? process.env['CLAUDE_PATH'] ?? 'claude',
      ...(c.claude?.apiKey ?? process.env['ANTHROPIC_API_KEY']
        ? { apiKey: c.claude?.apiKey ?? process.env['ANTHROPIC_API_KEY'] }
        : {}),
    },
    kiro: {
      apiKey: c.kiro?.apiKey ?? process.env['KIRO_API_KEY'] ?? '',
      endpoint: c.kiro?.endpoint ?? '',
    },
  };
}
