import type { AgentConnectorConfig } from '../config.js';
import type { AgentId } from '../types.js';
import { validateCopilotToken } from '../connectors/copilotAuth.js';

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
        return {
          agent,
          label: LABELS.copilot,
          ready: false,
          hint: 'Set GH_TOKEN (`gh auth token`) or save token in Harness configuration.',
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
          hint: 'Set DEVIN_API_KEY or configure in Harness.',
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
      if (!config.cursor.endpoint) {
        return {
          agent,
          label: LABELS.cursor,
          ready: false,
          hint: 'Set harness.connectors.cursor.endpoint or connectors.cursor.endpoint in .harness/config.yaml.',
        };
      }
      return {
        agent,
        label: LABELS.cursor,
        ready: true,
        hint: `Endpoint: ${config.cursor.endpoint}`,
      };
    }
    case 'claude': {
      return {
        agent,
        label: LABELS.claude,
        ready: true,
        hint: `CLI: ${config.claude.path}${config.claude.apiKey ? ' (API key set)' : ' (uses Claude CLI auth)'}`,
      };
    }
    case 'kiro': {
      if (config.kiro.mode === 'rest') {
        if (!config.kiro.apiKey || !config.kiro.endpoint) {
          return {
            agent,
            label: LABELS.kiro,
            ready: false,
            hint: 'REST mode: set KIRO_API_KEY and harness.connectors.kiro.endpoint.',
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
            'Install kiro-cli and run `harness aidlc install`.',
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
