import { marked } from 'marked';
import type {
  AgentDescriptor,
  AgentId,
  ChatMessage,
  ContextItem,
  CopilotMode,
  ExtensionMessage,
  InitializePayload,
  TokenUsagePayload,
  WebviewMessage,
} from '../../types';

// ---------------------------------------------------------------------------
// Marked configuration
// ---------------------------------------------------------------------------

marked.setOptions({ breaks: true, gfm: true });

// ---------------------------------------------------------------------------
// VSCode API
// ---------------------------------------------------------------------------

const vscode = acquireVsCodeApi<{ history: ChatMessage[]; agent: AgentId }>();

// ---------------------------------------------------------------------------
// Agent metadata
// ---------------------------------------------------------------------------

const AGENT_META: Record<AgentId, { initials: string; color: string; label: string }> = {
  copilot: { initials: 'GH', color: '#238636', label: 'GitHub Copilot' },
  devin:   { initials: 'DV', color: '#7c3aed', label: 'Devin' },
  cursor:  { initials: 'CA', color: '#0ea5e9', label: 'Cursor AI' },
  claude:  { initials: 'CC', color: '#d97706', label: 'Claude Code' },
  kiro:    { initials: 'KR', color: '#dc2626', label: 'Kiro (AI-DLC)' },
};

const SLASH_COMMANDS = [
  { cmd: '/skill',    hint: '/skill <name>    — apply a SDD skill' },
  { cmd: '/workflow', hint: '/workflow <name> — run a workflow spec' },
  { cmd: '/agent',    hint: '/agent <id>      — switch agent' },
  { cmd: '/clear',    hint: '/clear           — clear conversation' },
];

const SUGGESTIONS = [
  'Review this file for security issues',
  'Write unit tests for the selected code',
  'Explain what this function does',
  'Refactor using SOLID principles',
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface State {
  history: ChatMessage[];
  context: ContextItem[];
  agents: AgentDescriptor[];
  selectedAgent: AgentId;
  selectedMode: CopilotMode;
  isStreaming: boolean;
  sessionTokens: number;
  dailyTokens: number;
  budgetTokens: number;
}

const state: State = {
  history: [],
  context: [],
  agents: [],
  selectedAgent: 'copilot',
  selectedMode: 'ask',
  isStreaming: false,
  sessionTokens: 0,
  dailyTokens: 0,
  budgetTokens: 100000,
};

// ---------------------------------------------------------------------------
// Inject full HTML structure + styles
// ---------------------------------------------------------------------------

function injectShell(): void {
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);

  document.body.innerHTML = /* html */`
<div id="root">
  <div id="toolbar">
    <div id="agent-selector">
      <div id="agent-badge-display" class="agent-badge agent-badge--sm"></div>
      <select id="agent-dropdown" title="Select agent"></select>
    </div>
    <div style="display:flex;gap:4px;">
      <button id="config-btn" class="icon-btn" title="Harness Settings">&#9881;</button>
    </div>
  </div>

  <div id="mode-bar">
    <button class="mode-btn mode-btn--active" data-mode="ask"     title="Conversational Q&amp;A — no code modifications">Ask</button>
    <button class="mode-btn"                  data-mode="agent"   title="Autonomous coding agent — suggests file edits">Agent</button>
    <button class="mode-btn"                  data-mode="spec+agent" title="Agent + Spec context — injects your Spec Manager specs as context">Spec+Agent</button>
    <span id="mode-hint" class="mode-hint"></span>
  </div>

  <div id="context-bar">
    <span class="ctx-label">Context</span>
    <div id="context-list"></div>
    <button id="clear-ctx-btn" class="icon-btn" title="Clear all context" style="flex-shrink:0;">&#10005;</button>
  </div>

  <div id="messages"></div>

  <div id="slash-popover" class="slash-popover" style="display:none;"></div>

  <div id="input-area">
    <textarea
      id="prompt-input"
      placeholder="Ask your agent… (Ctrl+Enter to send, / for commands)"
      rows="3"
      autocomplete="off"
      spellcheck="true"
    ></textarea>
    <div id="input-actions">
      <span id="token-footer" class="token-footer">&#9711; 0 tokens this session</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <button id="send-btn" class="primary-btn">Send</button>
      </div>
    </div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// DOM references (set after injectShell)
// ---------------------------------------------------------------------------

let messagesEl: HTMLDivElement;
let inputEl: HTMLTextAreaElement;
let sendBtn: HTMLButtonElement;
let agentDropdown: HTMLSelectElement;
let agentBadgeDisplay: HTMLElement;
let clearCtxBtn: HTMLButtonElement;
let contextList: HTMLDivElement;
let configBtn: HTMLButtonElement;
let slashPopover: HTMLDivElement;
let tokenFooter: HTMLSpanElement;
let modeHint: HTMLSpanElement;

function bindRefs(): void {
  messagesEl       = document.getElementById('messages') as HTMLDivElement;
  inputEl          = document.getElementById('prompt-input') as HTMLTextAreaElement;
  sendBtn          = document.getElementById('send-btn') as HTMLButtonElement;
  agentDropdown    = document.getElementById('agent-dropdown') as HTMLSelectElement;
  agentBadgeDisplay = document.getElementById('agent-badge-display') as HTMLElement;
  clearCtxBtn      = document.getElementById('clear-ctx-btn') as HTMLButtonElement;
  contextList      = document.getElementById('context-list') as HTMLDivElement;
  configBtn        = document.getElementById('config-btn') as HTMLButtonElement;
  slashPopover     = document.getElementById('slash-popover') as HTMLDivElement;
  tokenFooter      = document.getElementById('token-footer') as HTMLSpanElement;
  modeHint         = document.getElementById('mode-hint') as HTMLSpanElement;
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function agentBadgeHtml(agentId: AgentId, size: 'sm' | 'md' = 'md'): string {
  const m = AGENT_META[agentId] ?? { initials: '??', color: '#888', label: agentId };
  return `<span class="agent-badge agent-badge--${size}" style="background:${m.color};" title="${m.label}">${m.initials}</span>`;
}

function fileIcon(item: ContextItem): string {
  if (item.kind === 'directory') return '📁';
  const ext = item.label.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '🟦', tsx: '🟦', js: '🟨', jsx: '🟨', mjs: '🟨',
    py: '🐍', go: '🐹', rs: '🦀', java: '☕',
    md: '📄', json: '📋', yaml: '📋', yml: '📋',
    css: '🎨', scss: '🎨', html: '🌐',
    sh: '⚙', bash: '⚙',
  };
  return map[ext] ?? '📄';
}

function renderMessages(): void {
  if (state.history.length === 0) {
    renderEmptyState();
    return;
  }
  messagesEl.innerHTML = '';
  for (const msg of state.history) {
    messagesEl.appendChild(buildMessageEl(msg));
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderEmptyState(): void {
  const chips = SUGGESTIONS.map(s =>
    `<button class="suggestion-chip" data-text="${s}">${s}</button>`
  ).join('');
  messagesEl.innerHTML = /* html */`
    <div class="empty-state">
      <div class="empty-logo">&#9670;</div>
      <p class="empty-title">Harness</p>
      <p class="empty-sub">Your meta-agent orchestrator. Pick a suggestion or type below.</p>
      <div class="suggestions">${chips}</div>
    </div>`;
  messagesEl.querySelectorAll('.suggestion-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = (btn as HTMLElement).dataset['text'] ?? '';
      inputEl.value = text;
      inputEl.focus();
      autoResize();
    });
  });
}

function buildMessageEl(msg: ChatMessage): HTMLElement {
  const el = document.createElement('div');
  el.className = `message message--${msg.role}`;
  el.dataset['messageId'] = msg.id;

  if (msg.role === 'user') {
    el.innerHTML = /* html */`
      <div class="message__header">
        <span class="message__role">You</span>
        <span class="message__time">${formatTime(msg.timestamp)}</span>
      </div>
      <div class="message__body">${escapeHtml(msg.content)}</div>`;
  } else {
    const agentId = msg.agent ?? state.selectedAgent;
    const meta = AGENT_META[agentId] ?? { initials: 'AI', color: '#888', label: agentId };
    const bodyHtml = msg.streaming
      ? `<span class="streaming-dots"><span>.</span><span>.</span><span>.</span></span>`
      : renderMarkdown(msg.content);

    el.innerHTML = /* html */`
      <div class="message__header">
        ${agentBadgeHtml(agentId)}
        <span class="message__role">${meta.label}</span>
        <span class="message__time">${formatTime(msg.timestamp)}</span>
        <button class="copy-btn" title="Copy response" data-id="${msg.id}">&#10697;</button>
      </div>
      <div class="message__body markdown-body">${bodyHtml}</div>
      ${msg.error ? `<div class="message__error">Error: ${escapeHtml(msg.error)}</div>` : ''}`;

    el.querySelector('.copy-btn')?.addEventListener('click', () => {
      const body = el.querySelector('.message__body');
      if (body) navigator.clipboard.writeText(body.textContent ?? '').catch(() => null);
    });
  }

  return el;
}

function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string;
  // Inject copy buttons into code blocks
  return html.replace(/<pre><code/g, `<div class="code-block"><button class="code-copy-btn" onclick="copyCode(this)">Copy</button><pre><code`)
             .replace(/<\/code><\/pre>/g, '</code></pre></div>');
}

function appendChunkToMessage(messageId: string, chunk: string): void {
  const msgEl = messagesEl.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;

  const body = msgEl.querySelector('.message__body') as HTMLElement;
  if (!body) return;

  // First chunk — remove streaming dots and set up content
  const dots = body.querySelector('.streaming-dots');
  if (dots) {
    body.removeChild(dots);
    body.classList.add('markdown-body');
    body.dataset['raw'] = '';
  }

  body.dataset['raw'] = (body.dataset['raw'] ?? '') + chunk;
  body.innerHTML = renderMarkdown(body.dataset['raw']);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // Re-bind copy buttons in code blocks
  body.querySelectorAll('.code-copy-btn').forEach(btn => {
    (btn as HTMLElement).onclick = () => copyCode(btn as HTMLButtonElement);
  });
}

function finalizeMessage(messageId: string): void {
  const msgEl = messagesEl.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;
  const dots = msgEl.querySelector('.streaming-dots');
  if (dots) dots.remove();
  const body = msgEl.querySelector('.message__body') as HTMLElement;
  if (body?.dataset['raw'] !== undefined) {
    body.innerHTML = renderMarkdown(body.dataset['raw'] ?? '');
  }
}

function renderContext(): void {
  contextList.innerHTML = '';
  for (const item of state.context) {
    const chip = document.createElement('div');
    chip.className = 'ctx-chip';
    chip.title = item.absolutePath;
    chip.innerHTML = `<span>${fileIcon(item)}</span><span class="ctx-chip__label">${item.label}</span>
      <button class="ctx-chip__remove" data-path="${item.absolutePath}" title="Remove">&#10005;</button>`;
    chip.querySelector('.ctx-chip__remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = (e.currentTarget as HTMLElement).dataset['path'] ?? '';
      postMessage({ command: 'removeContext', payload: { absolutePath: path } });
    });
    contextList.appendChild(chip);
  }

  const contextBar = document.getElementById('context-bar')!;
  contextBar.style.display = state.context.length > 0 ? 'flex' : 'none';
}

function renderAgentDropdown(): void {
  agentDropdown.innerHTML = '';
  for (const agent of state.agents) {
    const opt = document.createElement('option');
    opt.value = agent.id;
    opt.textContent = agent.label;
    if (agent.id === state.selectedAgent) opt.selected = true;
    agentDropdown.appendChild(opt);
  }
  updateAgentBadge();
}

function updateAgentBadge(): void {
  const m = AGENT_META[state.selectedAgent] ?? { initials: '??', color: '#888', label: '' };
  agentBadgeDisplay.textContent = m.initials;
  agentBadgeDisplay.style.background = m.color;
  agentBadgeDisplay.title = m.label;
}

const MODE_HINTS: Record<CopilotMode, string> = {
  ask:          '',
  agent:        'Agent will suggest file edits autonomously',
  'spec+agent': 'Spec context + autonomous agent mode',
};

function updateModeBar(): void {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    const b = btn as HTMLElement;
    b.classList.toggle('mode-btn--active', b.dataset['mode'] === state.selectedMode);
  });
  if (modeHint) {
    modeHint.textContent = MODE_HINTS[state.selectedMode] ?? '';
  }
  // Update placeholder to guide the user
  if (inputEl) {
    const hints: Record<CopilotMode, string> = {
      ask:          'Ask a question… (Ctrl+Enter to send)',
      agent:        'Describe the change you want… (Ctrl+Enter to send)',
      'spec+agent': 'Describe the task — specs will be injected as context… (Ctrl+Enter to send)',
    };
    inputEl.placeholder = hints[state.selectedMode];
  }
}

function setStreaming(streaming: boolean): void {
  state.isStreaming = streaming;
  sendBtn.textContent = streaming ? 'Stop' : 'Send';
  sendBtn.classList.toggle('stop-btn', streaming);
}

function updateTokenFooter(): void {
  tokenFooter.textContent = `⬡ ${state.sessionTokens.toLocaleString()} tokens this session`;
  if (state.dailyTokens > state.budgetTokens * 0.9) {
    tokenFooter.style.color = 'var(--vscode-errorForeground)';
  } else if (state.dailyTokens > state.budgetTokens * 0.7) {
    tokenFooter.style.color = 'var(--vscode-editorWarning-foreground)';
  } else {
    tokenFooter.style.color = '';
  }
}

// ---------------------------------------------------------------------------
// Slash command popover
// ---------------------------------------------------------------------------

function showSlashPopover(query: string): void {
  const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(query) || query === '/');
  if (matches.length === 0) { hideSlashPopover(); return; }

  slashPopover.innerHTML = matches.map(c =>
    `<div class="slash-item" data-cmd="${c.cmd}">${c.hint}</div>`
  ).join('');
  slashPopover.style.display = 'block';

  slashPopover.querySelectorAll('.slash-item').forEach(item => {
    item.addEventListener('click', () => {
      const cmd = (item as HTMLElement).dataset['cmd'] ?? '';
      inputEl.value = cmd + ' ';
      inputEl.focus();
      hideSlashPopover();
    });
  });
}

function hideSlashPopover(): void {
  slashPopover.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Auto-resize textarea
// ---------------------------------------------------------------------------

function autoResize(): void {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
}

// ---------------------------------------------------------------------------
// Message sending
// ---------------------------------------------------------------------------

function sendMessage(): void {
  if (state.isStreaming) {
    postMessage({ command: 'stopStream' });
    return;
  }

  let text = inputEl.value.trim();
  if (!text) return;

  // Parse slash commands
  if (text.startsWith('/clear')) {
    state.history = [];
    renderMessages();
    inputEl.value = '';
    autoResize();
    return;
  }
  if (text.startsWith('/agent ')) {
    const agentId = text.slice(7).trim() as AgentId;
    if (AGENT_META[agentId]) {
      state.selectedAgent = agentId;
      agentDropdown.value = agentId;
      updateAgentBadge();
      postMessage({ command: 'selectAgent', payload: { agent: agentId } });
    }
    inputEl.value = '';
    autoResize();
    return;
  }

  inputEl.value = '';
  autoResize();
  hideSlashPopover();
  setStreaming(true);

  postMessage({ command: 'sendMessage', payload: { text, agent: state.selectedAgent, mode: state.selectedMode } });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function bindEvents(): void {
  sendBtn.addEventListener('click', sendMessage);

  inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === 'Escape') hideSlashPopover();
  });

  inputEl.addEventListener('input', () => {
    autoResize();
    const val = inputEl.value;
    const slashMatch = val.match(/^(\/\S*)$/);
    if (slashMatch) {
      showSlashPopover(slashMatch[1]);
    } else {
      hideSlashPopover();
    }
  });

  agentDropdown.addEventListener('change', () => {
    state.selectedAgent = agentDropdown.value as AgentId;
    updateAgentBadge();
    postMessage({ command: 'selectAgent', payload: { agent: state.selectedAgent } });
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset['mode'] as CopilotMode;
      if (mode && mode !== state.selectedMode) {
        state.selectedMode = mode;
        updateModeBar();
        postMessage({ command: 'selectMode', payload: { mode } });
      }
    });
  });

  clearCtxBtn.addEventListener('click', () => {
    postMessage({ command: 'clearContext' });
  });

  configBtn.addEventListener('click', () => {
    postMessage({ command: 'openConfig' });
  });

  document.addEventListener('click', (e) => {
    if (!slashPopover.contains(e.target as Node) && e.target !== inputEl) {
      hideSlashPopover();
    }
  });
}

// ---------------------------------------------------------------------------
// Extension → Webview message handler
// ---------------------------------------------------------------------------

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  switch (msg.command) {
    case 'initialize': {
      const p = msg.payload as InitializePayload;
      state.agents = p.agents;
      state.selectedAgent = p.agent;
      state.selectedMode = p.mode ?? 'ask';
      state.history = p.history;
      state.context = p.context;
      renderAgentDropdown();
      renderMessages();
      renderContext();
      updateModeBar();
      break;
    }

    case 'appendChunk': {
      const p = msg.payload as {
        messageId?: string;
        message?: ChatMessage;
        chunk?: string;
        done: boolean;
      };
      if (p.message) {
        state.history.push(p.message);
        if (state.history.length === 1) messagesEl.innerHTML = '';
        messagesEl.appendChild(buildMessageEl(p.message));
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (p.messageId && p.chunk !== undefined) {
        appendChunkToMessage(p.messageId, p.chunk);
        const histMsg = state.history.find(m => m.id === p.messageId);
        if (histMsg) histMsg.content += p.chunk;
      }
      break;
    }

    case 'messageComplete': {
      const p = msg.payload as { messageId: string };
      const histMsg = state.history.find(m => m.id === p.messageId);
      if (histMsg) histMsg.streaming = false;
      finalizeMessage(p.messageId);
      setStreaming(false);
      break;
    }

    case 'messageError': {
      const p = msg.payload as { messageId: string; error: string };
      const histMsg = state.history.find(m => m.id === p.messageId);
      if (histMsg) { histMsg.streaming = false; histMsg.error = p.error; }
      finalizeMessage(p.messageId);
      setStreaming(false);
      const errEl = messagesEl.querySelector(`[data-message-id="${p.messageId}"]`);
      if (errEl && !errEl.querySelector('.message__error')) {
        const errDiv = document.createElement('div');
        errDiv.className = 'message__error';
        errDiv.textContent = `Error: ${p.error}`;
        errEl.appendChild(errDiv);
      }
      break;
    }

    case 'streamStopped':
      setStreaming(false);
      break;

    case 'contextUpdated':
      state.context = msg.payload as ContextItem[];
      renderContext();
      break;

    case 'agentChanged': {
      const p = msg.payload as { agent: AgentId };
      state.selectedAgent = p.agent;
      if (agentDropdown) agentDropdown.value = p.agent;
      updateAgentBadge();
      break;
    }

    case 'modeChanged': {
      const p = msg.payload as { mode: CopilotMode };
      state.selectedMode = p.mode;
      updateModeBar();
      break;
    }

    case 'tokenUsage': {
      const p = msg.payload as TokenUsagePayload;
      state.sessionTokens = p.sessionTokens;
      state.dailyTokens = p.dailyTokens;
      state.budgetTokens = p.budgetTokens;
      updateTokenFooter();
      break;
    }

    case 'error':
      console.error('Harness error:', msg.payload);
      break;
  }
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function postMessage(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Exposed globally for code-block copy buttons
(window as unknown as Record<string, unknown>)['copyCode'] = function copyCode(btn: HTMLButtonElement): void {
  const block = btn.closest('.code-block');
  if (!block) return;
  const code = block.querySelector('code');
  if (code) navigator.clipboard.writeText(code.textContent ?? '').catch(() => null);
  btn.textContent = 'Copied!';
  setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
};

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = /* css */`
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background);
  height: 100vh;
  overflow: hidden;
}

#root {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* ── Toolbar ─────────────────────────────────────────── */
#toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  background: var(--vscode-sideBar-background);
  flex-shrink: 0;
}

#agent-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.agent-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  border-radius: 4px;
  flex-shrink: 0;
  font-size: 10px;
  letter-spacing: 0.03em;
}
.agent-badge--sm { width: 26px; height: 20px; }
.agent-badge--md { width: 30px; height: 22px; }

#agent-dropdown {
  flex: 1;
  min-width: 0;
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border);
  padding: 3px 6px;
  border-radius: 3px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
}

.icon-btn {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 14px;
  opacity: 0.7;
  line-height: 1;
}
.icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

/* ── Mode bar ────────────────────────────────────────── */
#mode-bar {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 10px 4px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  background: var(--vscode-sideBar-background);
  flex-shrink: 0;
}

.mode-btn {
  background: none;
  border: 1px solid var(--vscode-button-secondaryBackground);
  color: var(--vscode-descriptionForeground);
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
  font-family: var(--vscode-font-family);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  white-space: nowrap;
  line-height: 18px;
}
.mode-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}
.mode-btn--active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}
.mode-btn--active:hover {
  background: var(--vscode-button-hoverBackground);
}

.mode-hint {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  margin-left: 4px;
  font-style: italic;
  opacity: 0.8;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Context bar ─────────────────────────────────────── */
#context-bar {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  background: var(--vscode-sideBar-background);
  flex-shrink: 0;
  overflow-x: auto;
}

.ctx-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}

.ctx-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 10px;
  padding: 2px 8px 2px 6px;
  font-size: 11px;
  white-space: nowrap;
  cursor: default;
}
.ctx-chip__label { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.ctx-chip__remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  opacity: 0.7;
  line-height: 1;
}
.ctx-chip__remove:hover { opacity: 1; }

/* ── Messages ────────────────────────────────────────── */
#messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scroll-behavior: smooth;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 32px 16px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  gap: 8px;
}
.empty-logo {
  font-size: 36px;
  opacity: 0.25;
  color: var(--vscode-foreground);
}
.empty-title { font-size: 16px; font-weight: 600; color: var(--vscode-foreground); }
.empty-sub   { font-size: 12px; max-width: 280px; line-height: 1.5; }
.suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  width: 100%;
  max-width: 300px;
}
.suggestion-chip {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  font-family: var(--vscode-font-family);
  transition: background 0.1s;
}
.suggestion-chip:hover { background: var(--vscode-button-secondaryHoverBackground); }

.message {
  display: flex;
  flex-direction: column;
  gap: 5px;
  animation: fadeIn 0.15s ease;
  max-width: 100%;
}

.message--user {
  align-self: flex-end;
  max-width: 88%;
  background: var(--vscode-editor-selectionBackground);
  border-radius: 10px 10px 3px 10px;
  padding: 8px 12px;
}
.message--assistant {
  align-self: flex-start;
  max-width: 100%;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 3px 10px 10px 10px;
  padding: 8px 12px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.message__header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}
.message__role { font-weight: 600; }
.message__time { margin-left: auto; }
.copy-btn {
  background: none;
  border: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  padding: 1px 4px;
  font-size: 13px;
  opacity: 0;
  border-radius: 3px;
}
.message:hover .copy-btn { opacity: 0.6; }
.copy-btn:hover { opacity: 1 !important; background: var(--vscode-toolbar-hoverBackground); }

.message__body {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--vscode-font-size);
  line-height: 1.6;
}

/* Markdown body resets */
.markdown-body { white-space: normal; }
.markdown-body p { margin: 0 0 8px; }
.markdown-body p:last-child { margin-bottom: 0; }
.markdown-body ul, .markdown-body ol { padding-left: 20px; margin: 4px 0 8px; }
.markdown-body li { margin: 2px 0; }
.markdown-body h1, .markdown-body h2, .markdown-body h3 {
  font-size: 1em; font-weight: 600; margin: 8px 0 4px;
}
.markdown-body blockquote {
  border-left: 3px solid var(--vscode-editorIndentGuide-activeBackground);
  padding-left: 10px; color: var(--vscode-descriptionForeground); margin: 6px 0;
}
.markdown-body code {
  background: var(--vscode-textCodeBlock-background);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
}
.code-block {
  position: relative;
  margin: 6px 0;
}
.code-block pre {
  background: var(--vscode-textCodeBlock-background);
  border-radius: 4px;
  padding: 10px 12px 10px;
  overflow-x: auto;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.88em;
  line-height: 1.5;
}
.code-block pre code { background: none; padding: 0; }
.code-copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.code-block:hover .code-copy-btn { opacity: 1; }

.message__error {
  margin-top: 4px;
  padding: 5px 8px;
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  border-radius: 4px;
  font-size: 11px;
  color: var(--vscode-errorForeground);
}

/* Streaming dots */
.streaming-dots {
  display: inline-flex;
  gap: 3px;
  padding: 4px 0;
}
.streaming-dots span {
  width: 6px; height: 6px;
  background: var(--vscode-descriptionForeground);
  border-radius: 50%;
  display: inline-block;
  animation: bounce 1.2s ease-in-out infinite;
}
.streaming-dots span:nth-child(2) { animation-delay: 0.2s; }
.streaming-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30%            { transform: translateY(-5px); }
}

/* ── Slash popover ───────────────────────────────────── */
.slash-popover {
  position: absolute;
  bottom: 110px;
  left: 10px;
  right: 10px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  z-index: 100;
  overflow: hidden;
}
.slash-item {
  padding: 7px 12px;
  font-size: 12px;
  font-family: var(--vscode-editor-font-family);
  cursor: pointer;
  color: var(--vscode-foreground);
  white-space: nowrap;
}
.slash-item:hover { background: var(--vscode-list-hoverBackground); }

/* ── Input area ──────────────────────────────────────── */
#input-area {
  padding: 8px 10px;
  border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  background: var(--vscode-sideBar-background);
}

#prompt-input {
  width: 100%;
  min-height: 56px;
  max-height: 150px;
  resize: none;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  line-height: 1.5;
  outline: none;
  overflow-y: auto;
}
#prompt-input:focus {
  border-color: var(--vscode-focusBorder);
  outline: 1px solid var(--vscode-focusBorder);
}

#input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.token-footer {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
}

.primary-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 4px;
  padding: 5px 16px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  cursor: pointer;
  font-weight: 500;
}
.primary-btn:hover { background: var(--vscode-button-hoverBackground); }
.primary-btn:disabled { opacity: 0.5; cursor: default; }
.stop-btn {
  background: var(--vscode-inputValidation-errorBackground) !important;
  color: var(--vscode-errorForeground) !important;
}
`;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

injectShell();
bindRefs();
bindEvents();
postMessage({ command: 'ready' });
