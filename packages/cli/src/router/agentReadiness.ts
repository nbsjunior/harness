import * as child_process from 'child_process';
import type { AgentConnectorConfig } from '../config.js';
import type { AgentId } from '../types.js';
import { validateCopilotToken } from '../connectors/copilotAuth.js';
import { isGhCliAvailable } from '../connectors/ghToken.js';
import { CURSOR_CLOUD_API_DEFAULT, normalizeCursorBaseUrl } from '../connectors/cursorCloud.js';

/** Returns true if `bin` is found in PATH (sync, best-effort). */
function isBinAvailable(bin: string): boolean {
  try {
    const cmd = process.platform === 'win32' ? `where "${bin}"` : `command -v "${bin}"`;
    child_process.execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export interface AgentReadiness {
  agent: AgentId;
  label: string;
  ready: boolean;
  hint: string;
}

const LABELS: Record<AgentId, string> = {
  copilot: 'GitHub Copilot',
  devin: 'Devin',
  cursor: 'Cursor AI',
  claude: 'Claude Code',
  kiro: 'Kiro (AI-DLC)',
};

export function checkAgentReadiness(
  agent: AgentId,
  config: AgentConnectorConfig,
): AgentReadiness {
  switch (agent) {
    case 'copilot': {
      if (!config.copilot.token) {
        const ghAvailable = isGhCliAvailable();
        return {
          agent,
          label: LABELS.copilot,
          ready: false,
          hint: ghAvailable
            ? '`gh` found but not authenticated. Run: gh auth login'
            : 'No token. Run `gh auth login` or save token in Todd → Configuration.',
        };
      }
      const tokenErr = validateCopilotToken(config.copilot.token);
      if (tokenErr) {
        return { agent, label: LABELS.copilot, ready: false, hint: tokenErr };
      }
      return {
        agent,
        label: LABELS.copilot,
        ready: true,
        hint: `Endpoint: ${config.copilot.endpoint}`,
      };
    }
    case 'devin': {
      if (!config.devin.apiKey) {
        return {
          agent,
          label: LABELS.devin,
          ready: false,
          hint:
            '[Devin] API key missing — set DEVIN_API_KEY or Todd → Configuration → Devin. ' +
            '(If you meant Cursor, select the **Cursor** pill in chat, not Auto/Devin.)',
        };
      }
      return {
        agent,
        label: LABELS.devin,
        ready: true,
        hint: `Endpoint: ${config.devin.endpoint}`,
      };
    }
    case 'cursor': {
      if (!config.cursor.apiKey) {
        return {
          agent,
          label: LABELS.cursor,
          ready: false,
          hint:
            '[Cursor] API key missing — set CURSOR_API_KEY or Todd → Configuration → Cursor ' +
            '(https://cursor.com/dashboard/integrations).',
        };
      }
      const base = normalizeCursorBaseUrl(config.cursor.endpoint || CURSOR_CLOUD_API_DEFAULT);
      return {
        agent,
        label: LABELS.cursor,
        ready: true,
        hint: `Cloud Agents API: ${base}`,
      };
    }
    case 'claude': {
      const claudeBin = config.claude.path ?? 'claude';
      if (!isBinAvailable(claudeBin)) {
        return {
          agent,
          label: LABELS.claude,
          ready: false,
          hint: `\`${claudeBin}\` not found in PATH. Install Claude CLI: https://claude.ai/code`,
        };
      }
      return {
        agent,
        label: LABELS.claude,
        ready: true,
        hint: `CLI: ${claudeBin}${config.claude.apiKey ? ' (API key set)' : ' (uses Claude CLI auth)'}`,
      };
    }
    case 'kiro': {
      if (config.kiro.mode === 'rest') {
        if (!config.kiro.apiKey || !config.kiro.endpoint) {
          return {
            agent,
            label: LABELS.kiro,
            ready: false,
            hint: 'REST mode: set KIRO_API_KEY and toddspect.connectors.kiro.endpoint.',
          };
        }
        return {
          agent,
          label: LABELS.kiro,
          ready: true,
          hint: `REST endpoint: ${config.kiro.endpoint}`,
        };
      }
      if (!config.kiro.apiKey) {
        return {
          agent,
          label: LABELS.kiro,
          ready: false,
          hint:
            'Set KIRO_API_KEY (Kiro Pro API key from https://kiro.dev/docs/cli/authentication). ' +
            'Install kiro-cli and run `toddspect aidlc install`.',
        };
      }
      return {
        agent,
        label: LABELS.kiro,
        ready: true,
        hint: `CLI: ${config.kiro.cliPath} · AI-DLC steering in .kiro/steering/`,
      };
    }
    default: {
      const _exhaustive: never = agent;
      return {
        agent: _exhaustive,
        label: String(_exhaustive),
        ready: false,
        hint: 'Unknown agent',
      };
    }
  }
}

export function checkAllAgents(config: AgentConnectorConfig): AgentReadiness[] {
  const agents: AgentId[] = ['copilot', 'devin', 'cursor', 'claude', 'kiro'];
  return agents.map((a) => checkAgentReadiness(a, config));
}
