import type {
  AgentId,
  AgentSelectionId,
  ConnectionResultPayload,
  ExtensionMessage,
  SecretStatusPayload,
  UsageStatsPayload,
  WebviewMessage,
} from '../../types';
import { MANUAL_STYLES, renderManualBody } from '../manual/shared.js';

// ---------------------------------------------------------------------------
// VSCode API
// ---------------------------------------------------------------------------

const vscode = acquireVsCodeApi();

// ---------------------------------------------------------------------------
// Agent metadata for the wizard
// ---------------------------------------------------------------------------

interface AgentInfo {
  id: AgentId;
  label: string;
  description: string;
  color: string;
  initials: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyEnvVar: string;
  instructions: string[];
  setupUrl: string;
  setupLabel: string;
  hasEndpoint: boolean;
  defaultEndpoint: string;
  endpointKey: string;
  secretKey: string;
}

const AGENTS: AgentInfo[] = [
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    description: 'OpenAI GPT-4o via GitHub API — best for code review and generation',
    color: '#238636',
    initials: 'GH',
    keyLabel: 'GitHub token (OAuth or fine-grained PAT)',
    keyPlaceholder: 'gho_… or github_pat_… (not ghp_)',
    keyEnvVar: 'GH_TOKEN or COPILOT_GITHUB_TOKEN',
    instructions: [
      'Classic tokens (ghp_…) do NOT work with api.githubcopilot.com.',
      'Recommended: open a terminal and run `gh auth login`, then `gh auth token` and paste the result here.',
      'Alternative: Fine-grained PAT → github.com/settings/personal-access-tokens',
      '  Enable Copilot permissions for your account (token prefix github_pat_).',
      'You need an active GitHub Copilot subscription on this account.',
    ],
    setupUrl: 'https://github.com/settings/personal-access-tokens',
    setupLabel: 'Open Fine-grained token settings',
    hasEndpoint: true,
    defaultEndpoint: 'https://api.githubcopilot.com',
    endpointKey: 'toddspect.connectors.copilot.endpoint',
    secretKey: 'toddspect.connectors.copilot.token',
  },
  {
    id: 'claude',
    label: 'Claude Code',
    description: 'Anthropic Claude — best for large context and complex reasoning',
    color: '#d97706',
    initials: 'CC',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-xxxxxxxxxxxxxxxxxxxx',
    keyEnvVar: 'ANTHROPIC_API_KEY',
    instructions: [
      'Go to console.anthropic.com → Settings → API Keys',
      'Click "Create Key" and give it a name',
      'Copy the key (it is only shown once)',
      'Paste it below',
    ],
    setupUrl: 'https://console.anthropic.com/settings/keys',
    setupLabel: 'Open Anthropic Console',
    hasEndpoint: false,
    defaultEndpoint: '',
    endpointKey: '',
    secretKey: 'toddspect.connectors.claude.apiKey',
  },
  {
    id: 'devin',
    label: 'Devin',
    description: 'Cognition AI Devin — autonomous software engineer for complex tasks',
    color: '#7c3aed',
    initials: 'DV',
    keyLabel: 'Devin API Key',
    keyPlaceholder: 'devin-xxxxxxxxxxxxxxxxxxxx',
    keyEnvVar: 'DEVIN_API_KEY',
    instructions: [
      'Log in to app.devin.ai',
      'Go to Settings → API Access',
      'Generate a new API key',
      'Paste it below',
    ],
    setupUrl: 'https://app.devin.ai/settings',
    setupLabel: 'Open Devin Settings',
    hasEndpoint: true,
    defaultEndpoint: 'https://api.devin.ai/v1',
    endpointKey: 'toddspect.connectors.devin.endpoint',
    secretKey: 'toddspect.connectors.devin.apiKey',
  },
  {
    id: 'cursor',
    label: 'Cursor AI',
    description: 'Cursor AI — integrates with your Cursor IDE workspace',
    color: '#0ea5e9',
    initials: 'CA',
    keyLabel: 'Cursor API Key',
    keyPlaceholder: 'cursor-xxxxxxxxxxxxxxxxxxxx',
    keyEnvVar: 'CURSOR_API_KEY',
    instructions: [
      'Open Cursor Dashboard → Integrations',
      'Create a Cloud Agents API key',
      'Paste it below (CURSOR_API_KEY)',
      'Endpoint should be https://api.cursor.com (not api2.cursor.sh)',
    ],
    setupUrl: 'https://cursor.com/dashboard/integrations',
    setupLabel: 'Open Cursor Integrations',
    hasEndpoint: true,
    defaultEndpoint: 'https://api.cursor.com',
    endpointKey: 'toddspect.connectors.cursor.endpoint',
    secretKey: 'toddspect.connectors.cursor.apiKey',
  },
  {
    id: 'kiro',
    label: 'Kiro (AI-DLC)',
    description: 'Kiro CLI + AWS AI-DLC steering rules in .kiro/steering/',
    color: '#dc2626',
    initials: 'KR',
    keyLabel: 'Kiro API Key',
    keyPlaceholder: 'From Kiro portal (KIRO_API_KEY)',
    keyEnvVar: 'KIRO_API_KEY',
    instructions: [
      'Install Kiro CLI: https://kiro.dev/docs/cli/',
      'Create an API key (Kiro Pro+) for headless mode',
      'Run ToddSpect: Install AI-DLC Workflow — copies rules to .kiro/steering/',
      'In chat, start with: Using AI-DLC, &lt;your request&gt;',
      'Artifacts are written to aidlc-docs/',
    ],
    setupUrl: 'https://kiro.dev/docs/cli/authentication',
    setupLabel: 'Kiro CLI authentication',
    hasEndpoint: false,
    defaultEndpoint: '',
    endpointKey: 'toddspect.connectors.kiro.endpoint',
    secretKey: 'toddspect.connectors.kiro.apiKey',
  },
];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type Step = 'welcome' | 'agentSelect' | 'configureAgent' | 'workspace' | 'mcp' | 'manual' | 'done';
type ConfigTab = 'agents' | 'api' | 'mcp' | 'workspace' | 'spending';

interface McpServer {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string;
  url?: string;
}

interface ApiServerEntry {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
}

interface WizardState {
  step: Step;
  agentQueue: AgentId[];
  agentQueueIndex: number;
  secretStatus: Record<AgentId, boolean>;
  connectionResults: Record<AgentId, { ok: boolean; error?: string; model?: string }>;
  pendingTestAgent: AgentId | null;
  specsDirectory: string;
  defaultAgent: AgentSelectionId;
  defaultWorkspace: string;
  resolvedWorkspace: string;
  promptOptimizationEnabled: boolean;
  maxContextCharsPerFile: number;
  maxHistoryMessages: number;
  usageStats: UsageStatsPayload | null;
  budgetEnabled: boolean;
  budgetTotalTokens: number;
  budgetWarnPercent: number;
  budgetTokensByAgentJson: string;
  cliPath: string;
  mcpEnabled: boolean;
  mcpServers: McpServer[];
  apiServers: ApiServerEntry[];
  agentEndpoints: Record<string, string>;
  selectedAgents: Set<AgentId>;
  /** When set, agents tab shows inline configure form for one agent */
  editingAgent: AgentId | null;
}

/** Tabbed settings (gear icon) vs first-run wizard */
let uiMode: 'tabs' | 'wizard' = 'tabs';
let activeTab: ConfigTab = 'agents';

const state: WizardState = {
  step: 'welcome',
  agentQueue: [],
  agentQueueIndex: 0,
  secretStatus: { copilot: false, devin: false, cursor: false, claude: false, kiro: false },
  connectionResults: {} as Record<AgentId, { ok: boolean; error?: string; model?: string }>,
  pendingTestAgent: null,
  specsDirectory: '.toddspect/specs',
  defaultAgent: 'auto',
  defaultWorkspace: '',
  resolvedWorkspace: '',
  promptOptimizationEnabled: true,
  maxContextCharsPerFile: 12_000,
  maxHistoryMessages: 24,
  usageStats: null,
  budgetEnabled: false,
  budgetTotalTokens: 0,
  budgetWarnPercent: 80,
  budgetTokensByAgentJson: '{}',
  cliPath: '',
  mcpEnabled: true,
  mcpServers: [],
  apiServers: [],
  agentEndpoints: {},
  selectedAgents: new Set<AgentId>(),
  editingAgent: null,
};

// ---------------------------------------------------------------------------
// Root render dispatcher
// ---------------------------------------------------------------------------

function render(): void {
  const root = document.getElementById('root')!;
  root.innerHTML = '';

  if (uiMode === 'tabs') {
    root.appendChild(renderTabsShell());
    return;
  }

  switch (state.step) {
    case 'welcome':       root.appendChild(renderWelcome()); break;
    case 'agentSelect':   root.appendChild(renderAgentSelect()); break;
    case 'configureAgent': root.appendChild(renderConfigureAgent()); break;
    case 'workspace':     root.appendChild(renderWorkspace()); break;
    case 'mcp':           root.appendChild(renderMcp()); break;
    case 'manual':        root.appendChild(renderManualWizard()); break;
    case 'done':          root.appendChild(renderDone()); break;
  }
}

// ---------------------------------------------------------------------------
// Tabbed configuration (ToddSpect: Open Configuration)
// ---------------------------------------------------------------------------

function renderTabsShell(): HTMLElement {
  const shell = div('tabs-shell');
  shell.innerHTML = /* html */`
    <header class="tabs-header">
      <h1 class="tabs-title">ToddSpect Configuration</h1>
      <button type="button" id="btn-run-wizard" class="btn-ghost btn-sm">Setup wizard</button>
    </header>
    <nav class="config-tabs" role="tablist">
      <button type="button" class="config-tab ${activeTab === 'agents' ? 'config-tab--active' : ''}" data-tab="agents">Agents</button>
      <button type="button" class="config-tab ${activeTab === 'api' ? 'config-tab--active' : ''}" data-tab="api">API Servers</button>
      <button type="button" class="config-tab ${activeTab === 'mcp' ? 'config-tab--active' : ''}" data-tab="mcp">MCP</button>
      <button type="button" class="config-tab ${activeTab === 'workspace' ? 'config-tab--active' : ''}" data-tab="workspace">Workspace</button>
      <button type="button" class="config-tab ${activeTab === 'spending' ? 'config-tab--active' : ''}" data-tab="spending">Spending</button>
    </nav>
    <div class="config-tab-panel"></div>`;

  const panel = shell.querySelector('.config-tab-panel') as HTMLElement;
  if (state.editingAgent && activeTab === 'agents') {
    panel.appendChild(renderConfigureAgent());
  } else {
    switch (activeTab) {
      case 'agents':
        panel.appendChild(renderAgentsTab());
        break;
      case 'api':
        panel.appendChild(renderApiServersTab());
        break;
      case 'mcp':
        panel.appendChild(renderMcpTabPanel());
        break;
      case 'workspace':
        panel.appendChild(renderWorkspaceTabPanel());
        break;
      case 'spending':
        panel.appendChild(renderSpendingTabPanel());
        break;
    }
  }

  shell.querySelectorAll('.config-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = (btn as HTMLElement).dataset['tab'] as ConfigTab;
      state.editingAgent = null;
      if (activeTab === 'spending') {
        postMessage({ command: 'getUsageStats' });
      }
      render();
    });
  });

  shell.querySelector('#btn-run-wizard')!.addEventListener('click', () => {
    uiMode = 'wizard';
    state.step = 'welcome';
    render();
  });

  return shell;
}

function renderAgentsTab(): HTMLElement {
  const el = div('tab-content');
  const cards = AGENTS.map((a) => {
    const ok = state.secretStatus[a.id];
    return /* html */`
      <div class="agent-card" data-agent="${a.id}">
        <div class="agent-card__badge" style="background:${a.color}">${a.initials}</div>
        <div class="agent-card__body">
          <div class="agent-card__name">${a.label}</div>
          <div class="agent-card__desc">${a.description}</div>
          <div class="agent-card__status ${ok ? 'status--ok' : 'status--warn'}">
            ${ok ? '&#10003; Configured' : '&#9888; Not configured'}
          </div>
        </div>
        <button type="button" class="btn-secondary btn-sm btn-configure-agent" data-agent="${a.id}">
          ${ok ? 'Edit' : 'Configure'}
        </button>
      </div>`;
  }).join('');

  el.innerHTML = /* html */`
    <p class="tab-intro">Connect AI agents. Tokens are stored securely in VS Code Secret Storage.</p>
    <div class="agent-grid">${cards}</div>
    <p class="form-hint">Default agent: <strong>${state.defaultAgent}</strong> (change in Workspace tab)</p>`;

  el.querySelectorAll('.btn-configure-agent').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingAgent = (btn as HTMLElement).dataset['agent'] as AgentId;
      state.agentQueue = [state.editingAgent];
      state.agentQueueIndex = 0;
      render();
    });
  });

  return el;
}

function renderApiServersTab(): HTMLElement {
  const el = div('tab-content');
  const builtin = AGENTS.filter((a) => a.hasEndpoint)
    .map((a) => /* html */`
      <div class="api-row api-row--builtin">
        <span class="api-row__name">${a.label}</span>
        <code class="api-row__url">${state.agentEndpoints[a.id] || a.defaultEndpoint || '—'}</code>
        <span class="badge">built-in</span>
      </div>`)
    .join('');

  const custom = state.apiServers
    .map(
      (s, i) => /* html */`
      <div class="api-row" data-index="${i}">
        <span class="api-row__name">${s.name}</span>
        <code class="api-row__url">${s.baseUrl}</code>
        <span class="badge">${s.model || 'OpenAI-compatible'}</span>
        <button type="button" class="icon-btn btn-remove-api" data-index="${i}" title="Remove">&#10005;</button>
      </div>`,
    )
    .join('');

  el.innerHTML = /* html */`
    <p class="tab-intro">Built-in agent endpoints and custom OpenAI-compatible API servers.</p>
    <h3 class="tab-h3">Built-in agents</h3>
    <div class="api-list">${builtin}</div>
    <h3 class="tab-h3">Custom API servers</h3>
    <div class="api-list" id="custom-api-list">${custom || '<p class="form-hint">No custom servers yet.</p>'}</div>
    <button type="button" id="btn-add-api" class="btn-secondary">+ Add API server</button>
    <div id="api-add-form" style="display:none;margin-top:12px;"></div>`;

  el.querySelectorAll('.btn-remove-api').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number((btn as HTMLElement).dataset['index']);
      state.apiServers.splice(idx, 1);
      postMessage({ command: 'saveSetting', payload: { key: 'toddspect.apiServers', value: state.apiServers } });
      render();
    });
  });

  el.querySelector('#btn-add-api')!.addEventListener('click', () => {
    const form = el.querySelector('#api-add-form') as HTMLElement;
    form.style.display = 'block';
    form.innerHTML = /* html */`
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="api-name" class="text-input" placeholder="My Local LLM" />
      </div>
      <div class="form-group">
        <label>Base URL</label>
        <input type="text" id="api-url" class="text-input" placeholder="http://localhost:11434/v1" />
      </div>
      <div class="form-group">
        <label>API Key <span class="form-optional">(optional)</span></label>
        <input type="password" id="api-key" class="text-input" placeholder="sk-…" />
      </div>
      <div class="form-actions">
        <button type="button" id="btn-save-api" class="btn-primary">Save</button>
        <button type="button" id="btn-cancel-api" class="btn-ghost">Cancel</button>
      </div>`;
    form.querySelector('#btn-cancel-api')!.addEventListener('click', () => {
      form.style.display = 'none';
    });
    form.querySelector('#btn-save-api')!.addEventListener('click', () => {
      const name = (form.querySelector('#api-name') as HTMLInputElement).value.trim();
      const baseUrl = (form.querySelector('#api-url') as HTMLInputElement).value.trim();
      const apiKey = (form.querySelector('#api-key') as HTMLInputElement).value.trim();
      if (!name || !baseUrl) return;
      state.apiServers.push({
        id: `api-${Date.now()}`,
        name,
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
      });
      postMessage({ command: 'saveSetting', payload: { key: 'toddspect.apiServers', value: state.apiServers } });
      render();
    });
  });

  return el;
}

function renderMcpTabPanel(): HTMLElement {
  const el = div('tab-content');
  const mcpSection = renderMcp();
  el.appendChild(mcpSection);
  return el;
}

function renderWorkspaceTabPanel(): HTMLElement {
  const el = div('tab-content');
  el.appendChild(renderWorkspaceSettingsForm(false));
  return el;
}

function formatDurationMs(ms: number): string {
  if (!ms || ms < 1000) return `${ms || 0}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const mrem = min % 60;
  return mrem > 0 ? `${hr}h ${mrem}m` : `${hr}h`;
}

function agentLabel(id: AgentId): string {
  return AGENTS.find((a) => a.id === id)?.label ?? id;
}

function renderSpendingTabPanel(): HTMLElement {
  const el = div('tab-content');
  const stats = state.usageStats;
  const total = stats?.total;
  const byAgent = stats?.byAgent;

  const providerRows = (['copilot', 'cursor', 'claude', 'devin', 'kiro'] as AgentId[])
    .map((id) => {
      const row = byAgent?.[id];
      if (!row || row.requests === 0) {
        return `<tr><td>${agentLabel(id)}</td><td colspan="4" class="spend-muted">—</td></tr>`;
      }
      return `<tr>
        <td>${agentLabel(id)}</td>
        <td>${row.requests.toLocaleString()}</td>
        <td>${row.tokensTotal.toLocaleString()}</td>
        <td>${row.tokensIn.toLocaleString()} / ${row.tokensOut.toLocaleString()}</td>
        <td>${formatDurationMs(row.totalDurationMs)}</td>
      </tr>`;
    })
    .join('');

  const recentRows = (stats?.recent ?? [])
    .slice(0, 15)
    .map(
      (r) => `<tr>
        <td>${new Date(r.at).toLocaleString()}</td>
        <td>${agentLabel(r.agent)}</td>
        <td>${r.tokensTotal.toLocaleString()}</td>
        <td>${formatDurationMs(r.durationMs)}</td>
        <td>${r.mode ?? '—'}</td>
      </tr>`,
    )
    .join('');

  const alertHtml = (stats?.alerts ?? [])
    .map((a) => `<div class="budget-alert budget-alert--${a.level}">${escapeHtml(a.message)}</div>`)
    .join('');

  el.innerHTML = /* html */`
    <p class="tab-intro">Token counts are <strong>estimates</strong> (~4 chars/token). Persisted in <code>.toddspect/usage-stats.json</code>.</p>

    <h3 class="spend-section-title">Budget alerts</h3>
    <label class="form-label"><input type="checkbox" id="sp-budget-enabled" ${state.budgetEnabled ? 'checked' : ''} /> Enable budget alerts</label>
    <label class="form-label">Total token budget (0 = off)
      <input type="number" id="sp-budget-total" class="form-input" min="0" value="${state.budgetTotalTokens}" />
    </label>
    <label class="form-label">Warn at % of budget
      <input type="number" id="sp-budget-warn" class="form-input" min="1" max="100" value="${state.budgetWarnPercent}" />
    </label>
    <label class="form-label">Per-provider caps (JSON)
      <textarea id="sp-budget-agents" class="form-input" rows="3">${escapeHtml(state.budgetTokensByAgentJson)}</textarea>
    </label>
    <button type="button" id="btn-save-budget" class="btn-secondary btn-sm">Save budget settings</button>
    ${alertHtml ? `<div class="spend-alerts">${alertHtml}</div>` : ''}

    <div class="spend-summary">
      <div class="spend-card">
        <div class="spend-card__label">Total tokens</div>
        <div class="spend-card__value">${(total?.tokensTotal ?? 0).toLocaleString()}</div>
      </div>
      <div class="spend-card">
        <div class="spend-card__label">Total requests</div>
        <div class="spend-card__value">${(total?.requests ?? 0).toLocaleString()}</div>
      </div>
      <div class="spend-card">
        <div class="spend-card__label">Agent time</div>
        <div class="spend-card__value">${formatDurationMs(total?.totalDurationMs ?? 0)}</div>
      </div>
      <div class="spend-card">
        <div class="spend-card__label">Workspace</div>
        <div class="spend-card__value spend-card__value--sm">${escapeHtml(state.resolvedWorkspace || '(none)')}</div>
      </div>
    </div>

    ${stats?.firstRequestAt ? `<p class="form-hint">First use: ${new Date(stats.firstRequestAt).toLocaleString()} · Last: ${stats.lastRequestAt ? new Date(stats.lastRequestAt).toLocaleString() : '—'}</p>` : ''}

    <h3 class="spend-section-title">By provider</h3>
    <table class="spend-table">
      <thead><tr><th>Provider</th><th>Requests</th><th>Tokens</th><th>In / Out</th><th>Time</th></tr></thead>
      <tbody>${providerRows}</tbody>
    </table>

    <h3 class="spend-section-title">Recent turns</h3>
    <table class="spend-table spend-table--compact">
      <thead><tr><th>When</th><th>Provider</th><th>Tokens</th><th>Duration</th><th>Mode</th></tr></thead>
      <tbody>${recentRows || '<tr><td colspan="5" class="spend-muted">No requests yet — send a chat message.</td></tr>'}</tbody>
    </table>

    <div class="spend-actions">
      <button type="button" id="btn-refresh-usage" class="btn-secondary btn-sm">Refresh</button>
      <button type="button" id="btn-reset-usage" class="btn-ghost btn-sm">Reset stats</button>
    </div>`;

  el.querySelector('#btn-refresh-usage')!.addEventListener('click', () => {
    postMessage({ command: 'getUsageStats' });
  });
  el.querySelector('#btn-reset-usage')!.addEventListener('click', () => {
    if (confirm('Reset all ToddSpect usage statistics for this workspace?')) {
      postMessage({ command: 'resetUsageStats' });
    }
  });
  el.querySelector('#btn-save-budget')!.addEventListener('click', () => {
    state.budgetEnabled = (el.querySelector('#sp-budget-enabled') as HTMLInputElement).checked;
    state.budgetTotalTokens = Number((el.querySelector('#sp-budget-total') as HTMLInputElement).value);
    state.budgetWarnPercent = Number((el.querySelector('#sp-budget-warn') as HTMLInputElement).value);
    state.budgetTokensByAgentJson = (el.querySelector('#sp-budget-agents') as HTMLTextAreaElement).value.trim();
    let byAgent: Record<string, number> = {};
    try {
      byAgent = JSON.parse(state.budgetTokensByAgentJson || '{}') as Record<string, number>;
    } catch {
      alert('Invalid JSON for per-provider caps');
      return;
    }
    postMessage({ command: 'saveSetting', payload: { key: 'toddspect.spending.budgetEnabled', value: state.budgetEnabled } });
    postMessage({ command: 'saveSetting', payload: { key: 'toddspect.spending.budgetTotalTokens', value: state.budgetTotalTokens } });
    postMessage({ command: 'saveSetting', payload: { key: 'toddspect.spending.budgetWarnPercent', value: state.budgetWarnPercent } });
    postMessage({ command: 'saveSetting', payload: { key: 'toddspect.spending.budgetTokensByAgent', value: byAgent } });
  });

  return el;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Screen 1 — Welcome
// ---------------------------------------------------------------------------

function renderWelcome(): HTMLElement {
  const el = div('screen screen--welcome');
  el.innerHTML = /* html */`
    <div class="welcome-logo">&#9670;</div>
    <h1 class="welcome-title">Welcome to ToddSpect</h1>
    <p class="welcome-sub">Your meta-agent orchestrator for VSCode.</p>

    <ul class="welcome-features">
      <li>&#10003; Chat with GitHub Copilot, Claude, Devin, Cursor AI &amp; AWS KIRO from one interface</li>
      <li>&#10003; Add files and folders as context with a right-click</li>
      <li>&#10003; Define reusable Skills, Tools and Workflows with Spec-Driven Development</li>
      <li>&#10003; Connect external MCP servers for tools and resources</li>
    </ul>

    <div class="welcome-actions">
      <button id="btn-get-started" class="btn-primary">Get started &#8594;</button>
      <button id="btn-skip-welcome" class="btn-ghost">Skip — I'll configure later</button>
    </div>`;

  el.querySelector('#btn-get-started')!.addEventListener('click', () => {
    state.step = 'agentSelect';
    render();
  });
  el.querySelector('#btn-skip-welcome')!.addEventListener('click', () => {
    state.step = 'workspace';
    render();
  });

  return el;
}

// ---------------------------------------------------------------------------
// Screen 2 — Agent Selection
// ---------------------------------------------------------------------------

function renderAgentSelect(): HTMLElement {
  const el = div('screen');
  el.innerHTML = /* html */`
    <div class="screen-header">
      <h2>Connect your AI agents</h2>
      <p class="screen-sub">Select the agents you want to configure. You can add more later.</p>
    </div>
    <div class="agent-grid" id="agent-grid"></div>
    <div class="screen-footer">
      <button id="btn-back-welcome" class="btn-ghost">&#8592; Back</button>
      <div style="display:flex;gap:8px;">
        <button id="btn-skip-agents" class="btn-secondary">Skip all</button>
        <button id="btn-configure-selected" class="btn-primary">Configure selected &#8594;</button>
      </div>
    </div>`;

  const grid = el.querySelector('#agent-grid')!;
  for (const agent of AGENTS) {
    const card = div('agent-card');
    const configured = state.secretStatus[agent.id];
    const selected = state.selectedAgents.has(agent.id);
    card.dataset['id'] = agent.id;
    if (selected) card.classList.add('agent-card--selected');
    card.innerHTML = /* html */`
      <div class="agent-card__check">${selected ? '&#10003;' : ''}</div>
      <div class="agent-card__icon" style="background:${agent.color};">${agent.initials}</div>
      <div class="agent-card__info">
        <div class="agent-card__name">${agent.label}</div>
        <div class="agent-card__desc">${agent.description}</div>
      </div>
      <div class="agent-card__status ${configured ? 'status--ok' : 'status--none'}">
        ${configured ? 'Configured' : 'Not configured'}
      </div>`;

    card.addEventListener('click', () => {
      if (state.selectedAgents.has(agent.id)) {
        state.selectedAgents.delete(agent.id);
        card.classList.remove('agent-card--selected');
        card.querySelector('.agent-card__check')!.innerHTML = '';
      } else {
        state.selectedAgents.add(agent.id);
        card.classList.add('agent-card--selected');
        card.querySelector('.agent-card__check')!.innerHTML = '&#10003;';
      }
    });
    grid.appendChild(card);
  }

  el.querySelector('#btn-back-welcome')!.addEventListener('click', () => {
    state.step = 'welcome';
    render();
  });
  el.querySelector('#btn-skip-agents')!.addEventListener('click', () => {
    state.step = 'workspace';
    render();
  });
  el.querySelector('#btn-configure-selected')!.addEventListener('click', () => {
    state.agentQueue = [...state.selectedAgents];
    state.agentQueueIndex = 0;
    if (state.agentQueue.length === 0) {
      state.step = 'workspace';
    } else {
      state.step = 'configureAgent';
    }
    render();
  });

  return el;
}

// ---------------------------------------------------------------------------
// Screen 3 — Per-Agent Configuration
// ---------------------------------------------------------------------------

function renderConfigureAgent(): HTMLElement {
  const agentId = state.agentQueue[state.agentQueueIndex];
  if (!agentId) { state.step = 'workspace'; render(); return div(''); }

  const info = AGENTS.find(a => a.id === agentId)!;
  const result = state.connectionResults[agentId];
  const isTesting = state.pendingTestAgent === agentId;

  const el = div('screen');

  const progressDots = state.agentQueue.map((id, i) =>
    `<span class="progress-dot ${i <= state.agentQueueIndex ? 'progress-dot--active' : ''}" title="${AGENTS.find(a=>a.id===id)?.label}"></span>`
  ).join('');

  el.innerHTML = /* html */`
    <div class="screen-header">
      <div class="agent-heading">
        <div class="agent-icon-lg" style="background:${info.color};">${info.initials}</div>
        <div>
          <h2>${info.label}</h2>
          <p class="screen-sub">${info.description}</p>
        </div>
      </div>
      <div class="progress-dots">${progressDots}</div>
    </div>

    <div class="setup-instructions">
      <div class="setup-steps">
        ${info.instructions.map((s, i) => `<div class="setup-step"><span class="step-num">${i+1}</span>${s}</div>`).join('')}
      </div>
      <a href="${info.setupUrl}" class="setup-link" id="btn-open-url">
        ${info.setupLabel} &#8599;
      </a>
    </div>

    <div class="form-group">
      <label class="form-label">${info.keyLabel}
        <span class="env-hint">or set <code>${info.keyEnvVar}</code> env var</span>
      </label>
      <div class="secret-input-row">
        <input type="password" id="secret-input" class="text-input" placeholder="${info.keyPlaceholder}" autocomplete="off" />
        <button id="btn-toggle-secret" class="icon-btn" title="Show/hide">&#128065;</button>
        <button id="btn-test" class="btn-secondary ${isTesting ? 'btn-loading' : ''}" ${isTesting ? 'disabled' : ''}>
          ${isTesting ? '<span class="btn-spinner"></span> Testing…' : 'Test connection'}
        </button>
      </div>
      <div id="connection-result" class="connection-result ${result ? (result.ok ? 'result--ok' : 'result--err') : ''}">
        ${result ? (result.ok
          ? `&#10003; Connected${result.model ? ` — model: ${result.model}` : ''}`
          : `&#10007; ${result.error ?? 'Connection failed'}`)
          : ''}
      </div>
    </div>

    ${info.hasEndpoint ? /* html */`
    <div class="form-group">
      <label class="form-label">API Endpoint</label>
      <input type="text" id="endpoint-input" class="text-input"
        placeholder="${info.defaultEndpoint || 'https://...'}"
        value="${info.defaultEndpoint}" />
    </div>` : ''}

    <div class="screen-footer">
      <button id="btn-back-agents" class="btn-ghost">&#8592; Back</button>
      <div style="display:flex;gap:8px;">
        <button id="btn-skip-agent" class="btn-ghost">Skip</button>
        <button id="btn-save-agent" class="btn-primary">Save &amp; Continue &#8594;</button>
      </div>
    </div>`;

  const secretInput = el.querySelector('#secret-input') as HTMLInputElement;
  const endpointInput = el.querySelector('#endpoint-input') as HTMLInputElement | null;

  el.querySelector('#btn-open-url')?.addEventListener('click', (e) => {
    e.preventDefault();
    postMessage({ command: 'saveSetting', payload: { key: '__openUrl', value: info.setupUrl } });
  });

  el.querySelector('#btn-toggle-secret')!.addEventListener('click', () => {
    secretInput.type = secretInput.type === 'password' ? 'text' : 'password';
  });

  el.querySelector('#btn-test')!.addEventListener('click', () => {
    const token = secretInput.value.trim();
    if (!token) return;
    state.pendingTestAgent = agentId;
    render();
    postMessage({
      command: 'testConnection',
      payload: { agent: agentId, token, endpoint: endpointInput?.value.trim() ?? '' },
    });
  });

  el.querySelector('#btn-back-agents')!.addEventListener('click', () => {
    if (uiMode === 'tabs') {
      state.editingAgent = null;
      render();
      return;
    }
    state.step = 'agentSelect';
    render();
  });

  el.querySelector('#btn-skip-agent')!.addEventListener('click', advanceAgentQueue);

  el.querySelector('#btn-save-agent')!.addEventListener('click', () => {
    const token = secretInput.value.trim();
    if (token) {
      postMessage({ command: 'saveSecret', payload: { key: info.secretKey, value: token } });
    }
    if (info.hasEndpoint && endpointInput?.value.trim()) {
      postMessage({
        command: 'saveSetting',
        payload: { key: info.endpointKey, value: endpointInput.value.trim() },
      });
    }
    advanceAgentQueue();
  });

  return el;
}

function advanceAgentQueue(): void {
  state.pendingTestAgent = null;
  if (uiMode === 'tabs') {
    state.editingAgent = null;
    render();
    return;
  }
  state.agentQueueIndex++;
  if (state.agentQueueIndex >= state.agentQueue.length) {
    state.step = 'workspace';
  }
  render();
}

// ---------------------------------------------------------------------------
// Screen 4 — Workspace Settings
// ---------------------------------------------------------------------------

function saveWorkspaceFieldsFrom(container: HTMLElement): void {
  state.defaultAgent = (container.querySelector('#ws-default-agent') as HTMLSelectElement)
    .value as AgentSelectionId;
  state.defaultWorkspace = (container.querySelector('#ws-default-workspace') as HTMLInputElement).value.trim();
  state.specsDirectory = (container.querySelector('#ws-specs-dir') as HTMLInputElement).value.trim();
  state.cliPath = (container.querySelector('#ws-cli-path') as HTMLInputElement).value.trim();
  state.promptOptimizationEnabled = (container.querySelector('#ws-prompt-opt') as HTMLInputElement).checked;
  state.maxContextCharsPerFile = Number(
    (container.querySelector('#ws-max-ctx-chars') as HTMLInputElement).value,
  );
  state.maxHistoryMessages = Number(
    (container.querySelector('#ws-max-history') as HTMLInputElement).value,
  );

  postMessage({ command: 'saveSetting', payload: { key: 'toddspect.defaultAgent', value: state.defaultAgent } });
  postMessage({
    command: 'saveSetting',
    payload: { key: 'toddspect.defaultWorkspace', value: state.defaultWorkspace },
  });
  postMessage({ command: 'saveSetting', payload: { key: 'toddspect.specsDirectory', value: state.specsDirectory } });
  if (state.cliPath) {
    postMessage({ command: 'saveSetting', payload: { key: 'toddspect.cliPath', value: state.cliPath } });
  }
  postMessage({
    command: 'saveSetting',
    payload: { key: 'toddspect.promptOptimization.enabled', value: state.promptOptimizationEnabled },
  });
  postMessage({
    command: 'saveSetting',
    payload: { key: 'toddspect.promptOptimization.maxContextCharsPerFile', value: state.maxContextCharsPerFile },
  });
  postMessage({
    command: 'saveSetting',
    payload: { key: 'toddspect.promptOptimization.maxHistoryMessages', value: state.maxHistoryMessages },
  });
}

function renderWorkspaceSettingsForm(wizardMode: boolean): HTMLElement {
  const el = div(wizardMode ? 'screen' : 'tab-content');
  const agentOptions =
    `<option value="auto" ${state.defaultAgent === 'auto' ? 'selected' : ''}>Auto (ToddSpect picks)</option>` +
    AGENTS.map(
      (a) =>
        `<option value="${a.id}" ${state.defaultAgent === a.id ? 'selected' : ''}>${a.label}</option>`,
    ).join('');

  const header = wizardMode
    ? `<div class="screen-header">
      <h2>Workspace settings</h2>
      <p class="screen-sub">These settings apply to the current workspace.</p>
    </div>`
    : `<p class="tab-intro">Workspace root, specs path, and prompt efficiency (all providers).</p>`;

  const footer = wizardMode
    ? `<div class="screen-footer">
      <button id="btn-ws-back" class="btn-ghost">&#8592; Back</button>
      <button id="btn-ws-next" class="btn-primary">Next &#8594;</button>
    </div>`
    : `<div class="form-actions">
      <button type="button" id="btn-ws-save" class="btn-primary btn-sm">Save workspace settings</button>
    </div>`;

  el.innerHTML = /* html */`
    ${header}

    <div class="form-group">
      <label class="form-label">Default workspace path</label>
      <input type="text" id="ws-default-workspace" class="text-input" value="${escapeHtml(state.defaultWorkspace)}"
        placeholder="Absolute path — empty = VS Code folder" />
      <div class="form-hint">CLI uses this as <code>TODDSPECT_WORKSPACE</code>. Active: <code>${escapeHtml(state.resolvedWorkspace || '(VS Code folder)')}</code></div>
    </div>

    <div class="form-group">
      <label class="form-label">Default agent</label>
      <select id="ws-default-agent" class="select-input">${agentOptions}</select>
    </div>

    <div class="form-group">
      <label class="form-label">Specs directory</label>
      <input type="text" id="ws-specs-dir" class="text-input" value="${escapeHtml(state.specsDirectory)}" />
    </div>

    <div class="form-group form-group--row">
      <label class="form-label"><input type="checkbox" id="ws-prompt-opt" ${state.promptOptimizationEnabled ? 'checked' : ''} /> Prompt optimization (token efficiency)</label>
    </div>

    <div class="form-group">
      <label class="form-label">Max chars per context file</label>
      <input type="number" id="ws-max-ctx-chars" class="text-input" min="1000" max="500000"
        value="${state.maxContextCharsPerFile}" />
    </div>

    <div class="form-group">
      <label class="form-label">Max history messages</label>
      <input type="number" id="ws-max-history" class="text-input" min="4" max="200"
        value="${state.maxHistoryMessages}" />
    </div>

    <div class="form-group">
      <label class="form-label">CLI path <span class="form-optional">(optional)</span></label>
      <input type="text" id="ws-cli-path" class="text-input" value="${escapeHtml(state.cliPath)}"
        placeholder="Leave empty to use bundled CLI" />
    </div>

    ${footer}`;

  if (wizardMode) {
    el.querySelector('#btn-ws-back')!.addEventListener('click', () => {
      if (state.agentQueue.length > 0) {
        state.step = 'configureAgent';
        state.agentQueueIndex = state.agentQueue.length - 1;
      } else {
        state.step = 'agentSelect';
      }
      render();
    });
    el.querySelector('#btn-ws-next')!.addEventListener('click', () => {
      saveWorkspaceFieldsFrom(el);
      state.step = 'mcp';
      render();
    });
  } else {
    el.querySelector('#btn-ws-save')!.addEventListener('click', () => {
      saveWorkspaceFieldsFrom(el);
    });
  }

  return el;
}

function renderWorkspace(): HTMLElement {
  return renderWorkspaceSettingsForm(true);
}


// ---------------------------------------------------------------------------
// Screen 5 — MCP Servers
// ---------------------------------------------------------------------------

function renderMcp(): HTMLElement {
  const el = div('screen');

  const serversHtml = state.mcpServers.map((s, i) => `
    <div class="mcp-row" data-index="${i}">
      <span class="mcp-row__name">${s.name}</span>
      <span class="mcp-row__transport badge">${s.transport}</span>
      <span class="mcp-row__cmd">${s.command ?? s.url ?? ''}</span>
      <button class="mcp-row__remove icon-btn" data-index="${i}" title="Remove">&#10005;</button>
    </div>`).join('');

  el.innerHTML = /* html */`
    <div class="screen-header">
      <h2>MCP Servers <span class="form-optional">(optional)</span></h2>
      <p class="screen-sub">Connect Model Context Protocol servers to give agents access to tools and resources.</p>
    </div>

    <div class="form-group" style="flex-direction:row;align-items:center;gap:10px;">
      <label class="toggle-label">
        <input type="checkbox" id="mcp-toggle" ${state.mcpEnabled ? 'checked' : ''} />
        Enable MCP client
      </label>
    </div>

    <div id="mcp-servers-list" class="mcp-list">${serversHtml || '<p class="form-hint" style="padding:8px 0;">No servers configured.</p>'}</div>

    <div id="mcp-add-form" class="mcp-add-form" style="display:none;"></div>

    <button id="btn-add-server" class="btn-secondary" style="margin-top:8px;">+ Add server</button>

    <div class="screen-footer">
      <button id="btn-mcp-back" class="btn-ghost">&#8592; Back</button>
      <button id="btn-mcp-next" class="btn-primary">Next &#8594;</button>
    </div>`;

  el.querySelector('#mcp-toggle')!.addEventListener('change', (e) => {
    state.mcpEnabled = (e.target as HTMLInputElement).checked;
    postMessage({ command: 'saveSetting', payload: { key: 'toddspect.mcp.enabled', value: state.mcpEnabled } });
  });

  el.querySelectorAll('.mcp-row__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset['index'] ?? '0', 10);
      state.mcpServers.splice(idx, 1);
      render();
    });
  });

  el.querySelector('#btn-add-server')!.addEventListener('click', () => {
    const form = el.querySelector('#mcp-add-form') as HTMLElement;
    form.style.display = 'block';
    form.innerHTML = /* html */`
      <div class="mcp-form-row">
        <input type="text" id="mcp-name" class="text-input" placeholder="Server name (e.g. filesystem)" />
        <select id="mcp-transport" class="select-input">
          <option value="stdio">stdio</option>
          <option value="http">http</option>
        </select>
      </div>
      <div id="mcp-stdio-fields">
        <input type="text" id="mcp-command" class="text-input" placeholder="Command (e.g. npx)" style="margin-top:6px;" />
        <input type="text" id="mcp-args" class="text-input" placeholder="Args (e.g. -y @modelcontextprotocol/server-filesystem /workspace)" style="margin-top:4px;" />
      </div>
      <div id="mcp-http-fields" style="display:none;">
        <input type="text" id="mcp-url" class="text-input" placeholder="URL (e.g. http://localhost:3100)" style="margin-top:6px;" />
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button id="btn-mcp-save" class="btn-primary">Add</button>
        <button id="btn-mcp-cancel" class="btn-ghost">Cancel</button>
      </div>`;

    form.querySelector('#mcp-transport')!.addEventListener('change', (e) => {
      const isHttp = (e.target as HTMLSelectElement).value === 'http';
      (form.querySelector('#mcp-stdio-fields') as HTMLElement).style.display = isHttp ? 'none' : '';
      (form.querySelector('#mcp-http-fields') as HTMLElement).style.display = isHttp ? '' : 'none';
    });

    form.querySelector('#btn-mcp-cancel')!.addEventListener('click', () => {
      form.style.display = 'none';
    });

    form.querySelector('#btn-mcp-save')!.addEventListener('click', () => {
      const name = (form.querySelector('#mcp-name') as HTMLInputElement).value.trim();
      const transport = (form.querySelector('#mcp-transport') as HTMLSelectElement).value as 'stdio' | 'http';
      if (!name) return;

      const server: McpServer = { name, transport };
      if (transport === 'stdio') {
        server.command = (form.querySelector('#mcp-command') as HTMLInputElement).value.trim();
        server.args = (form.querySelector('#mcp-args') as HTMLInputElement).value.trim();
      } else {
        server.url = (form.querySelector('#mcp-url') as HTMLInputElement).value.trim();
      }
      state.mcpServers.push(server);
      postMessage({ command: 'saveSetting', payload: { key: 'toddspect.mcp.servers', value: state.mcpServers } });
      render();
    });
  });

  el.querySelector('#btn-mcp-back')!.addEventListener('click', () => {
    state.step = 'workspace';
    render();
  });

  el.querySelector('#btn-mcp-next')!.addEventListener('click', () => {
    state.step = 'manual';
    render();
  });

  return el;
}

// ---------------------------------------------------------------------------
// Screen 6 — User Manual (final wizard step)
// ---------------------------------------------------------------------------

function renderManualWizard(): HTMLElement {
  const el = div('screen manual-wizard-screen');

  el.innerHTML = /* html */`
    <div class="manual-wizard-scroll">
      ${renderManualBody()}
    </div>
    <div class="screen-footer">
      <button type="button" id="btn-manual-back" class="btn-ghost">&#8592; Back</button>
      <div style="display:flex;gap:8px;">
        <button type="button" id="btn-manual-popout" class="btn-ghost">Open in editor tab</button>
        <button type="button" id="btn-manual-finish" class="btn-primary">Finish setup &#8594;</button>
      </div>
    </div>`;

  el.querySelector('#btn-manual-back')!.addEventListener('click', () => {
    state.step = 'mcp';
    render();
  });
  el.querySelector('#btn-manual-popout')!.addEventListener('click', () => {
    postMessage({ command: 'openUserManual' });
  });
  el.querySelector('#btn-manual-finish')!.addEventListener('click', () => {
    state.step = 'done';
    render();
  });

  return el;
}

// ---------------------------------------------------------------------------
// Screen 7 — Done
// ---------------------------------------------------------------------------

function renderDone(): HTMLElement {
  const el = div('screen screen--done');

  const configured = AGENTS.filter(a => state.secretStatus[a.id]);
  const configuredCards = configured.map(a => /* html */`
    <div class="done-card">
      <div class="agent-icon-lg" style="background:${a.color};">${a.initials}</div>
      <div class="done-card__info">
        <div class="done-card__name">${a.label}</div>
        <div class="done-card__status status--ok">&#10003; Connected</div>
      </div>
    </div>`).join('');

  const unconfigured = AGENTS.filter(a => !state.secretStatus[a.id]);
  const unconfiguredNote = unconfigured.length > 0
    ? `<p class="done-note">Not configured: ${unconfigured.map(a => a.label).join(', ')}. You can add them anytime via <em>ToddSpect: Open Configuration</em>.</p>`
    : '';

  el.innerHTML = /* html */`
    <div class="done-hero">
      <div class="done-check">&#10003;</div>
      <h2>You're all set!</h2>
      <p class="screen-sub">ToddSpect is configured and ready to use.</p>
    </div>

    ${configuredCards.length > 0
      ? `<div class="done-cards">${configuredCards}</div>`
      : `<p class="form-hint" style="text-align:center;">No agents configured yet. You can add them anytime.</p>`}

    ${unconfiguredNote}

    <div class="done-actions">
      <button id="btn-open-chat" class="btn-primary btn-xl">Open Chat &#8594;</button>
      <button id="btn-open-manual" class="btn-secondary">User Manual</button>
      <button id="btn-reconfigure" class="btn-ghost">Reconfigure agents</button>
    </div>`;

  el.querySelector('#btn-open-chat')!.addEventListener('click', () => {
    postMessage({ command: 'openChat' });
  });

  el.querySelector('#btn-open-manual')!.addEventListener('click', () => {
    postMessage({ command: 'openUserManual' });
  });

  el.querySelector('#btn-reconfigure')!.addEventListener('click', () => {
    state.step = 'agentSelect';
    render();
  });

  return el;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  switch (msg.command) {
    case 'configLoaded': {
      const cfg = msg.payload as {
        specsDirectory: string;
        defaultAgent: AgentSelectionId;
        defaultWorkspace?: string;
        resolvedWorkspace?: string;
        cliPath: string;
        promptOptimization?: {
          enabled: boolean;
          maxContextCharsPerFile: number;
          maxHistoryMessages: number;
        };
        mcpEnabled: boolean;
        mcpServers: McpServer[];
        apiServers?: ApiServerEntry[];
        agentEndpoints?: Record<string, string>;
        spending?: {
          budgetEnabled?: boolean;
          budgetTotalTokens?: number;
          budgetWarnPercent?: number;
          budgetTokensByAgent?: Record<string, number>;
        };
      };
      state.specsDirectory = cfg.specsDirectory;
      state.defaultAgent = cfg.defaultAgent;
      state.defaultWorkspace = cfg.defaultWorkspace ?? '';
      state.resolvedWorkspace = cfg.resolvedWorkspace ?? '';
      state.cliPath = cfg.cliPath;
      state.promptOptimizationEnabled = cfg.promptOptimization?.enabled ?? true;
      state.maxContextCharsPerFile = cfg.promptOptimization?.maxContextCharsPerFile ?? 12_000;
      state.maxHistoryMessages = cfg.promptOptimization?.maxHistoryMessages ?? 24;
      state.budgetEnabled = cfg.spending?.budgetEnabled ?? false;
      state.budgetTotalTokens = cfg.spending?.budgetTotalTokens ?? 0;
      state.budgetWarnPercent = cfg.spending?.budgetWarnPercent ?? 80;
      state.budgetTokensByAgentJson = JSON.stringify(cfg.spending?.budgetTokensByAgent ?? {}, null, 2);
      state.mcpEnabled = cfg.mcpEnabled;
      state.mcpServers = cfg.mcpServers ?? [];
      state.apiServers = cfg.apiServers ?? [];
      state.agentEndpoints = cfg.agentEndpoints ?? {};
      uiMode = 'tabs';
      render();
      break;
    }

    case 'usageStats': {
      state.usageStats = msg.payload as UsageStatsPayload;
      if (activeTab === 'spending') {
        render();
      }
      break;
    }

    case 'secretStatus': {
      const s = msg.payload as SecretStatusPayload;
      state.secretStatus = { ...s };
      if (state.step === 'agentSelect' || state.step === 'done') render();
      break;
    }

    case 'connectionResult': {
      const r = msg.payload as ConnectionResultPayload;
      state.connectionResults[r.agent] = { ok: r.ok, error: r.error, model: r.model };
      state.pendingTestAgent = null;
      if (r.ok) state.secretStatus[r.agent] = true;
      render();
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function postMessage(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = /* css */`
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  height: 100vh;
  overflow: auto;
  padding: 0;
}

#root {
  max-width: 640px;
  margin: 0 auto;
  padding: 0 24px 40px;
}

/* ── Screens ─────────────────────────────────────────── */
.screen {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 28px;
}

.screen-header { display: flex; flex-direction: column; gap: 4px; }
.screen-header h2 { font-size: 18px; font-weight: 600; }
.screen-sub { font-size: 12px; color: var(--vscode-descriptionForeground); }

.screen-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--vscode-widget-border);
}

/* ── Welcome ─────────────────────────────────────────── */
.screen--welcome { align-items: center; text-align: center; padding-top: 48px; }
.welcome-logo { font-size: 48px; opacity: 0.35; color: var(--vscode-foreground); margin-bottom: 8px; }
.welcome-title { font-size: 24px; font-weight: 700; margin-bottom: 6px; }
.welcome-sub { font-size: 13px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
.welcome-features {
  list-style: none;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 8px;
  padding: 16px 20px;
  width: 100%;
  max-width: 440px;
}
.welcome-features li { font-size: 13px; color: var(--vscode-foreground); }
.welcome-actions { display: flex; flex-direction: column; gap: 8px; align-items: center; margin-top: 8px; }

/* ── Agent grid ──────────────────────────────────────── */
.agent-grid { display: flex; flex-direction: column; gap: 8px; }

.agent-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  cursor: pointer;
  background: var(--vscode-editor-inactiveSelectionBackground);
  transition: border-color 0.15s, background 0.15s;
  position: relative;
}
.agent-card:hover { border-color: var(--vscode-focusBorder); }
.agent-card--selected {
  border-color: var(--vscode-focusBorder);
  background: var(--vscode-editor-selectionBackground);
}

.agent-card__check {
  width: 18px;
  height: 18px;
  border: 2px solid var(--vscode-widget-border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  color: var(--vscode-foreground);
  background: var(--vscode-input-background);
}
.agent-card--selected .agent-card__check {
  background: var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
  color: #fff;
}

.agent-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 12px;
  color: #fff;
  flex-shrink: 0;
}

.agent-card__info { flex: 1; min-width: 0; }
.agent-card__name { font-weight: 600; font-size: 13px; }
.agent-card__desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }

.agent-card__status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
  font-weight: 500;
}
.status--ok   { background: #238636; color: #fff; }
.status--none { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.status--err  { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-errorForeground); }

/* ── Configure Agent ─────────────────────────────────── */
.agent-heading { display: flex; align-items: center; gap: 12px; }
.agent-icon-lg {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  color: #fff;
  flex-shrink: 0;
}

.progress-dots { display: flex; gap: 6px; margin-top: 10px; }
.progress-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--vscode-badge-background);
}
.progress-dot--active { background: var(--vscode-focusBorder); }

.setup-instructions {
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.setup-steps { display: flex; flex-direction: column; gap: 6px; }
.setup-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
}
.step-num {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.setup-link {
  font-size: 12px;
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}
.setup-link:hover { text-decoration: underline; }

/* ── Form elements ───────────────────────────────────── */
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-label {
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.form-optional { font-weight: 400; color: var(--vscode-descriptionForeground); }
.env-hint { font-weight: 400; color: var(--vscode-descriptionForeground); font-size: 11px; }
.form-hint { font-size: 11px; color: var(--vscode-descriptionForeground); }
.form-hint code {
  font-family: var(--vscode-editor-font-family);
  background: var(--vscode-textCodeBlock-background);
  padding: 1px 4px;
  border-radius: 2px;
}

.text-input {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
  padding: 6px 10px;
  border-radius: 4px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
}
.text-input:focus {
  outline: 1px solid var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
}

.select-input {
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  width: 100%;
}

.secret-input-row { display: flex; gap: 6px; align-items: center; }
.secret-input-row .text-input { flex: 1; }

.connection-result {
  font-size: 12px;
  min-height: 20px;
  padding: 0 2px;
}
.result--ok  { color: #4caf50; }
.result--err { color: var(--vscode-errorForeground); }

/* ── Config tabs ───────────────────────────────────── */
.tabs-shell { display: flex; flex-direction: column; height: 100%; }
.tabs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 8px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
}
.tabs-title { font-size: 16px; font-weight: 600; margin: 0; }
.btn-sm { padding: 4px 10px; font-size: 11px; }
.config-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  flex-shrink: 0;
}
.config-tab {
  background: none;
  border: none;
  color: var(--vscode-descriptionForeground);
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: var(--vscode-font-family);
}
.config-tab:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
.config-tab--active {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  font-weight: 600;
}
.config-tab-panel { flex: 1; overflow-y: auto; padding: 16px 20px; }
.tab-content { max-width: 640px; }
.tab-intro { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; line-height: 1.5; }
.tab-h3 { font-size: 13px; font-weight: 600; margin: 16px 0 8px; }
.agent-grid { display: flex; flex-direction: column; gap: 8px; }
.agent-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--vscode-sideBarSectionHeader-border);
  border-radius: 8px;
  background: var(--vscode-editor-inactiveSelectionBackground);
}
.agent-card__body { flex: 1; min-width: 0; }
.status--warn { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-editorWarning-foreground); }
.api-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.api-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  font-size: 12px;
}
.api-row__name { font-weight: 600; min-width: 100px; }
.api-row__url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  flex-shrink: 0;
}
.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  font-family: var(--vscode-font-family);
  font-size: 12px;
}
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

/* ── MCP ─────────────────────────────────────────────── */
.mcp-list { display: flex; flex-direction: column; gap: 4px; }
.mcp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 6px;
  font-size: 12px;
}
.mcp-row__name { font-weight: 600; min-width: 80px; }
.badge {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 2px 7px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}
.mcp-row__cmd { flex: 1; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-row__remove { margin-left: auto; flex-shrink: 0; }

.mcp-add-form {
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 8px;
  padding: 12px 14px;
}
.mcp-form-row { display: flex; gap: 8px; }
.mcp-form-row .text-input { flex: 1; }
.mcp-form-row .select-input { width: 100px; flex-shrink: 0; }

.toggle-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }

/* ── Done ────────────────────────────────────────────── */
.screen--done { align-items: center; text-align: center; padding-top: 48px; }
.done-hero { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.done-check {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: #238636;
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.done-cards { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.done-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 8px;
  text-align: left;
}
.done-card__info { flex: 1; }
.done-card__name { font-weight: 600; font-size: 13px; }
.done-card__status { font-size: 11px; margin-top: 2px; }
.done-note { font-size: 11px; color: var(--vscode-descriptionForeground); }
.done-actions { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 8px; }

/* ── Buttons ─────────────────────────────────────────── */
.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 5px;
  padding: 7px 20px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  cursor: pointer;
  font-weight: 500;
}
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.btn-primary:disabled { opacity: 0.5; cursor: default; }
.btn-xl { padding: 10px 32px; font-size: 14px; }

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  border-radius: 5px;
  padding: 7px 16px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  cursor: pointer;
}
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
.btn-secondary:disabled { opacity: 0.5; cursor: default; }

.btn-ghost {
  background: none;
  color: var(--vscode-foreground);
  border: none;
  padding: 7px 12px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  cursor: pointer;
  opacity: 0.7;
  border-radius: 4px;
}
.btn-ghost:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

.icon-btn {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  opacity: 0.6;
}
.icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

.btn-loading { opacity: 0.7; cursor: default; }
.btn-spinner {
  display: inline-block;
  width: 10px; height: 10px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 2px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.spend-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.spend-card {
  padding: 12px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 8px;
  background: var(--vscode-editor-background);
}
.spend-card__label {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
}
.spend-card__value {
  font-size: 20px;
  font-weight: 600;
}
.spend-card__value--sm {
  font-size: 11px;
  font-weight: 400;
  word-break: break-all;
}
.spend-section-title {
  font-size: 13px;
  margin: 16px 0 8px;
}
.spend-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-bottom: 12px;
}
.spend-table th,
.spend-table td {
  border: 1px solid var(--vscode-panel-border);
  padding: 6px 8px;
  text-align: left;
}
.spend-table th {
  background: var(--vscode-sideBar-background);
  font-weight: 600;
}
.spend-muted { color: var(--vscode-descriptionForeground); }
.spend-actions { display: flex; gap: 8px; margin-top: 12px; }
.form-actions { margin-top: 12px; }
.form-group--row label { display: flex; align-items: center; gap: 8px; }

/* ── User manual (wizard final step) ───────────────── */
#root:has(.manual-wizard-screen) { max-width: 820px; }
.manual-wizard-screen { width: 100%; }
.manual-wizard-scroll {
  max-height: calc(100vh - 88px);
  overflow-y: auto;
  padding: 8px 0 16px;
}
`;


// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const styleEl = document.createElement('style');
styleEl.textContent = CSS + MANUAL_STYLES;
document.head.appendChild(styleEl);

document.getElementById('root')!.innerHTML = '<div class="screen" style="padding-top:48px;text-align:center;color:var(--vscode-descriptionForeground);">Loading…</div>';

postMessage({ command: 'ready' });
