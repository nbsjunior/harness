import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { AgentId } from './types.js';
import { resolveKiroCliPathSync } from './kiro/bootstrap.js';

export interface AgentConnectorConfig {
  copilot: { token: string; endpoint: string };
  devin: { apiKey: string; endpoint: string };
  cursor: { apiKey: string; endpoint: string };
  claude: { path: string; apiKey?: string };
  kiro: KiroConnectorConfig;
}

export interface KiroConnectorConfig {
  /** kiro-cli binary (default: kiro-cli). */
  cliPath: string;
  /** Kiro Pro API key for headless mode (KIRO_API_KEY). */
  apiKey: string;
  /** Tool categories for --trust-tools (e.g. read,grep,write). */
  trustTools: string;
  trustAllTools: boolean;
  /** Auto-install AI-DLC steering rules before Kiro chat when missing. */
  aidlcAutoInstall: boolean;
  /** Legacy REST fallback — only used when mode is "rest". */
  endpoint: string;
  mode: 'cli' | 'rest';
}

export interface LoadedHarnessConfig {
  connectors: AgentConnectorConfig;
  defaultAgent: AgentId;
}

interface HarnessConfigFile {
  defaultAgent?: AgentId;
  connectors?: {
    copilot?: { token?: string; endpoint?: string };
    devin?: { apiKey?: string; endpoint?: string };
    cursor?: { apiKey?: string; endpoint?: string };
    claude?: { path?: string; apiKey?: string };
    kiro?: {
      apiKey?: string;
      endpoint?: string;
      cliPath?: string;
      trustTools?: string;
      trustAllTools?: boolean;
      aidlcAutoInstall?: boolean;
      mode?: 'cli' | 'rest';
    };
  };
  aidlc?: { autoInstall?: boolean };
}

/** Non-secret settings pushed from the VS Code extension via HARNESS_SETTINGS_JSON. */
interface HarnessSettingsBridge {
  defaultAgent?: AgentId;
  connectors?: HarnessConfigFile['connectors'];
  aidlc?: HarnessConfigFile['aidlc'];
}

function getWorkspaceRoot(): string {
  return process.env['HARNESS_WORKSPACE'] ?? process.cwd();
}

function resolveInWorkspace(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) {
    return relativeOrAbsolute;
  }
  return path.join(getWorkspaceRoot(), relativeOrAbsolute);
}

function loadSettingsBridge(): HarnessSettingsBridge {
  const raw = process.env['HARNESS_SETTINGS_JSON'];
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as HarnessSettingsBridge;
  } catch {
    process.stderr.write('[harness-cli] Failed to parse HARNESS_SETTINGS_JSON\n');
    return {};
  }
}

function loadYamlConfig(specsDir?: string): HarnessConfigFile {
  const workspace = getWorkspaceRoot();
  const candidates: string[] = [];

  if (specsDir) {
    const resolvedSpecs = resolveInWorkspace(specsDir);
    candidates.push(path.join(resolvedSpecs, '..', 'config.yaml'));
    candidates.push(path.join(resolvedSpecs, '..', 'config.yml'));
  }

  candidates.push(
    path.join(workspace, '.harness', 'config.yaml'),
    path.join(workspace, '.harness', 'config.yml'),
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const fileConfig = (yaml.load(fs.readFileSync(candidate, 'utf-8')) as HarnessConfigFile) ?? {};
        process.stderr.write(`[harness-cli] Loaded config from: ${candidate}\n`);
        return fileConfig;
      } catch (err) {
        process.stderr.write(
          `[harness-cli] Failed to parse config at ${candidate}: ${(err as Error).message}\n`,
        );
      }
      break;
    }
  }

  return {};
}

/**
 * Load merged configuration:
 *  1. `.harness/config.yaml`
 *  2. `HARNESS_SETTINGS_JSON` (VS Code extension — endpoints, paths)
 *  3. Environment variables (secrets / tokens)
 */
export function loadHarnessConfig(specsDir?: string): LoadedHarnessConfig {
  const fileConfig = loadYamlConfig(specsDir);
  const bridge = loadSettingsBridge();

  const yamlC = fileConfig.connectors ?? {};
  const bridgeC = bridge.connectors ?? {};

  const connectors: AgentConnectorConfig = {
    copilot: {
      token:
        yamlC.copilot?.token ??
        process.env['COPILOT_GITHUB_TOKEN'] ??
        process.env['GH_TOKEN'] ??
        process.env['GITHUB_TOKEN'] ??
        process.env['COPILOT_TOKEN'] ??
        '',
      endpoint:
        bridgeC.copilot?.endpoint ??
        yamlC.copilot?.endpoint ??
        'https://api.githubcopilot.com',
    },
    devin: {
      apiKey:
        yamlC.devin?.apiKey ??
        bridgeC.devin?.apiKey ??
        process.env['DEVIN_API_KEY'] ??
        '',
      endpoint:
        bridgeC.devin?.endpoint ?? yamlC.devin?.endpoint ?? 'https://api.devin.ai/v1',
    },
    cursor: {
      apiKey:
        yamlC.cursor?.apiKey ??
        bridgeC.cursor?.apiKey ??
        process.env['CURSOR_API_KEY'] ??
        '',
      endpoint: bridgeC.cursor?.endpoint ?? yamlC.cursor?.endpoint ?? '',
    },
    claude: {
      path: bridgeC.claude?.path ?? yamlC.claude?.path ?? process.env['CLAUDE_PATH'] ?? 'claude',
      ...(yamlC.claude?.apiKey ??
      bridgeC.claude?.apiKey ??
      process.env['ANTHROPIC_API_KEY']
        ? {
            apiKey:
              yamlC.claude?.apiKey ??
              bridgeC.claude?.apiKey ??
              process.env['ANTHROPIC_API_KEY'],
          }
        : {}),
    },
    kiro: {
      cliPath:
        process.env['KIRO_CLI_PATH'] ??
        bridgeC.kiro?.cliPath ??
        yamlC.kiro?.cliPath ??
        resolveKiroCliPathSync(),
      apiKey:
        yamlC.kiro?.apiKey ??
        bridgeC.kiro?.apiKey ??
        process.env['KIRO_API_KEY'] ??
        '',
      trustTools:
        bridgeC.kiro?.trustTools ??
        yamlC.kiro?.trustTools ??
        'read,grep,write',
      trustAllTools:
        bridgeC.kiro?.trustAllTools ?? yamlC.kiro?.trustAllTools ?? false,
      aidlcAutoInstall:
        bridge.aidlc?.autoInstall ??
        yamlC.kiro?.aidlcAutoInstall ??
        bridgeC.kiro?.aidlcAutoInstall ??
        true,
      endpoint: bridgeC.kiro?.endpoint ?? yamlC.kiro?.endpoint ?? '',
      mode:
        bridgeC.kiro?.mode ??
        yamlC.kiro?.mode ??
        (yamlC.kiro?.endpoint || bridgeC.kiro?.endpoint ? 'rest' : 'cli'),
    },
  };

  const defaultAgent =
    bridge.defaultAgent ?? fileConfig.defaultAgent ?? 'copilot';

  return { connectors, defaultAgent };
}

/** @deprecated Use loadHarnessConfig — returns connectors only. */
export function loadAgentConfig(specsDir?: string): AgentConnectorConfig {
  return loadHarnessConfig(specsDir).connectors;
}
