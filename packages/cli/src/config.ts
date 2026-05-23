/**
 * @module config
 * Merges Todd configuration from YAML, environment variables, and the VS Code settings bridge.
 *
 * **Why:** Connectors need a single `AgentConnectorConfig` whether the CLI runs as a daemon
 * (extension) or standalone (`todd chat`). Secrets come from env; endpoints often from
 * `TODDSPECT_SETTINGS_JSON`.
 *
 * **Copilot token order:** YAML token → env vars → `getGhCliToken()` (live `gh auth token`).
 * Extension-side precedence for env injection is defined in `configBridge.ts` (gh first).
 *
 * @see loadToddSpectConfig — full merge including defaultAgent
 * @see loadAgentConfig — connectors only (used by IPC router)
 */
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { AgentId, AgentSelectionId } from './types.js';
import { resolveKiroCliPathSync } from './kiro/bootstrap.js';
import { getGhCliToken } from './connectors/ghToken.js';
import {
  DEFAULT_SPENDING_BUDGET,
  type SpendingBudgetSettings,
} from './usage/budget.js';

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

export interface LoadedToddSpectConfig {
  connectors: AgentConnectorConfig;
  defaultAgent: AgentSelectionId;
}

interface ToddSpectConfigFile {
  defaultAgent?: AgentSelectionId;
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

/** Non-secret settings pushed from the VS Code extension via TODDSPECT_SETTINGS_JSON. */
interface ToddSpectSettingsBridge {
  defaultAgent?: AgentSelectionId;
  connectors?: ToddSpectConfigFile['connectors'];
  aidlc?: ToddSpectConfigFile['aidlc'];
  promptOptimization?: {
    enabled?: boolean;
    maxContextCharsPerFile?: number;
    maxHistoryMessages?: number;
  };
  spending?: {
    budgetEnabled?: boolean;
    budgetTotalTokens?: number;
    budgetWarnPercent?: number;
    budgetTokensByAgent?: Partial<Record<AgentId, number>>;
  };
}

export interface ToddSpectPromptSettings {
  enabled: boolean;
  maxContextCharsPerFile: number;
  maxHistoryMessages: number;
}

/** Workspace root — set by extension via TODDSPECT_WORKSPACE (may override VS Code folder). */
export function getWorkspaceRoot(): string {
  const fromEnv = process.env['TODDSPECT_WORKSPACE']?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return process.cwd();
}

export function loadSpendingBudgetSettings(): SpendingBudgetSettings {
  const bridge = loadSettingsBridge();
  const s = bridge.spending ?? {};
  if (!s.budgetEnabled) {
    return { ...DEFAULT_SPENDING_BUDGET };
  }
  return {
    enabled: true,
    totalTokens: Math.max(0, s.budgetTotalTokens ?? 0),
    warnPercent: Math.min(100, Math.max(1, s.budgetWarnPercent ?? 80)),
    byAgent: s.budgetTokensByAgent ?? {},
  };
}

export function loadPromptSettings(): ToddSpectPromptSettings {
  const bridge = loadSettingsBridge();
  const p = bridge.promptOptimization ?? {};
  return {
    enabled: p.enabled !== false,
    maxContextCharsPerFile: p.maxContextCharsPerFile ?? 12_000,
    maxHistoryMessages: p.maxHistoryMessages ?? 24,
  };
}

function resolveInWorkspace(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) {
    return relativeOrAbsolute;
  }
  return path.join(getWorkspaceRoot(), relativeOrAbsolute);
}

function loadSettingsBridge(): ToddSpectSettingsBridge {
  const raw = process.env['TODDSPECT_SETTINGS_JSON'];
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as ToddSpectSettingsBridge;
  } catch {
    process.stderr.write('[toddspect-cli] Failed to parse TODDSPECT_SETTINGS_JSON\n');
    return {};
  }
}

/** First non-empty trimmed string; treats `""` as unset (settings bridge often sends empty defaults). */
function pickNonEmpty(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function loadYamlConfig(specsDir?: string): ToddSpectConfigFile {
  const workspace = getWorkspaceRoot();
  const candidates: string[] = [];

  if (specsDir) {
    const resolvedSpecs = resolveInWorkspace(specsDir);
    candidates.push(path.join(resolvedSpecs, '..', 'config.yaml'));
    candidates.push(path.join(resolvedSpecs, '..', 'config.yml'));
  }

  candidates.push(
    path.join(workspace, '.toddspect', 'config.yaml'),
    path.join(workspace, '.toddspect', 'config.yml'),
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const fileConfig = (yaml.load(fs.readFileSync(candidate, 'utf-8')) as ToddSpectConfigFile) ?? {};
        process.stderr.write(`[toddspect-cli] Loaded config from: ${candidate}\n`);
        return fileConfig;
      } catch (err) {
        process.stderr.write(
          `[toddspect-cli] Failed to parse config at ${candidate}: ${(err as Error).message}\n`,
        );
      }
      break;
    }
  }

  return {};
}

/**
 * Load the fully-merged agent configuration.
 *
 * Merge order (highest precedence first):
 *  1. `getGhCliToken()` — live `gh auth token` subprocess (Copilot only)
 *  2. Environment variables (`GH_TOKEN`, `ANTHROPIC_API_KEY`, `KIRO_API_KEY`, …)
 *  3. `TODDSPECT_SETTINGS_JSON` — VS Code settings bridged by `configBridge.ts`
 *  4. `.toddspect/config.yaml` in the workspace
 *  5. Built-in defaults
 *
 * The returned `LoadedToddSpectConfig` is the single source of truth for all
 * connector settings inside the CLI. Never read env vars or config files directly
 * elsewhere — always call this function.
 *
 * @param specsDir - workspace-relative path to the specs directory, used to
 *                   locate the config file. Defaults to `.toddspect`.
 */
export function loadToddSpectConfig(specsDir?: string): LoadedToddSpectConfig {
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
        getGhCliToken() ??   // auto-detect from `gh auth token` when no env var is set
        '',
      endpoint:
        bridgeC.copilot?.endpoint ??
        yamlC.copilot?.endpoint ??
        'https://api.githubcopilot.com',
    },
    devin: {
      apiKey: pickNonEmpty(
        process.env['DEVIN_API_KEY'],
        bridgeC.devin?.apiKey,
        yamlC.devin?.apiKey,
      ),
      endpoint:
        bridgeC.devin?.endpoint ?? yamlC.devin?.endpoint ?? 'https://api.devin.ai/v1',
    },
    cursor: {
      apiKey: pickNonEmpty(
        process.env['CURSOR_API_KEY'],
        bridgeC.cursor?.apiKey,
        yamlC.cursor?.apiKey,
      ),
      endpoint: pickNonEmpty(
        bridgeC.cursor?.endpoint,
        yamlC.cursor?.endpoint,
        process.env['CURSOR_API_ENDPOINT'],
        'https://api.cursor.com',
      ),
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
      apiKey: pickNonEmpty(
        process.env['KIRO_API_KEY'],
        bridgeC.kiro?.apiKey,
        yamlC.kiro?.apiKey,
      ),
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

/** @deprecated Use loadToddSpectConfig — returns connectors only. */
export function loadAgentConfig(specsDir?: string): AgentConnectorConfig {
  return loadToddSpectConfig(specsDir).connectors;
}
