import type { AgentId } from '../types.js';

export interface ProviderModelOption {
  id: string;
  label: string;
}

/** Models exposed in the UI per provider (`auto` = provider default). */
export const PROVIDER_MODEL_OPTIONS: Record<AgentId, ProviderModelOption[]> = {
  copilot: [
    { id: 'auto', label: 'LLM Auto' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'o1', label: 'o1' },
    { id: 'o1-mini', label: 'o1 mini' },
  ],
  cursor: [
    { id: 'auto', label: 'LLM Auto' },
    { id: 'claude-sonnet', label: 'Claude Sonnet' },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ],
  devin: [
    { id: 'auto', label: 'LLM Auto' },
    { id: 'devin-default', label: 'Devin default' },
  ],
  claude: [
    { id: 'auto', label: 'LLM Auto' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  ],
  kiro: [
    { id: 'auto', label: 'LLM Auto' },
    { id: 'kiro-default', label: 'Kiro default' },
  ],
};

const COPILOT_DEFAULT = 'gpt-4o';

export function resolveProviderModel(agent: AgentId, model?: string): string | undefined {
  const pick = (model ?? 'auto').trim();
  if (!pick || pick === 'auto') {
    switch (agent) {
      case 'copilot':
        return COPILOT_DEFAULT;
      case 'cursor':
      case 'devin':
      case 'claude':
      case 'kiro':
        return undefined;
      default:
        return undefined;
    }
  }
  return pick;
}
