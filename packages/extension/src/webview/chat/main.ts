/**
 * @module webview/chat/main
 * Cursor-inspired Harness chat UI.
 */
import { marked } from 'marked';
import type {
  AgentDescriptor,
  AgentId,
  AgentSelectionId,
  ChatAutoRoutedPayload,
  ChatMessage,
  ContextItem,
  CopilotMode,
  ExtensionMessage,
  InitializePayload,
  LiveEditEntry,
  ProviderModelOption,
  TokenUsagePayload,
  WebviewMessage,
} from '../../types';
import { PROVIDER_MODEL_OPTIONS } from '../../models/providerModels';

marked.setOptions({ breaks: true, gfm: true });

const vscode = acquireVsCodeApi<{ history: ChatMessage[]; agent: AgentSelectionId }>();

const AUTO_META = { short: 'Auto', color: '#a855f7', label: 'Auto (Harness of AI picks provider)' };

const AGENT_META: Record<AgentId, { short: string; color: string; label: string }> = {
  copilot: { short: 'Copilot', color: '#238636', label: 'GitHub Copilot' },
  devin:   { short: 'Devin',   color: '#7c3aed', label: 'Devin' },
  cursor:  { short: 'Cursor',  color: '#0ea5e9', label: 'Cursor AI' },
  claude:  { short: 'Claude',  color: '#d97706', label: 'Claude Code' },
  kiro:    { short: 'Kiro',    color: '#dc2626', label: 'Kiro (AI-DLC)' },
};

const FILE_EXTENSIONS =
  'ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|md|json|yaml|yml|css|scss|html|sh|sql|cs|cpp|h|vue|svelte|php|rb|kt|swift|toml|txt|xml';

const SLASH_COMMANDS = [
  { cmd: '/clear',    hint: '/clear — new chat (keeps context files)' },
  { cmd: '/agent',    hint: '/agent <id> — switch provider' },
];

interface State {
  history: ChatMessage[];
  context: ContextItem[];
  agents: AgentDescriptor[];
  selectedAgent: AgentSelectionId;
  lastAutoRoute?: ChatAutoRoutedPayload;
  selectedMode: CopilotMode;
  isStreaming: boolean;
  sessionTokens: number;
  selectedModel: string;
  providerModels: Record<AgentId, ProviderModelOption[]>;
  liveEdits: LiveEditEntry[];
  canRevert: boolean;
}

const state: State = {
  history: [],
  context: [],
  agents: [],
  selectedAgent: 'auto',
  selectedMode: 'ask',
  isStreaming: false,
  sessionTokens: 0,
  selectedModel: 'auto',
  providerModels: PROVIDER_MODEL_OPTIONS,
  liveEdits: [],
  canRevert: false,
};

let messagesEl!: HTMLDivElement;
let inputEl!: HTMLTextAreaElement;
let sendBtn!: HTMLButtonElement;
let providerPills!: HTMLDivElement;
let modelPills!: HTMLDivElement;
let liveEditsEl!: HTMLDivElement;
let revertBtn!: HTMLButtonElement;
let terminalBtn!: HTMLButtonElement;
let clearCtxBtn!: HTMLButtonElement;
let newChatBtn!: HTMLButtonElement;
let contextList!: HTMLDivElement;
let configBtn!: HTMLButtonElement;
let slashPopover!: HTMLDivElement;
let tokenFooter!: HTMLSpanElement;

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function injectShell(): void {
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  document.body.innerHTML = /* html */`
<div id="root">
  <div id="messages"></div>
  <div id="slash-popover" class="slash-popover" style="display:none;"></div>
  <div id="composer">
    <div id="composer-toolbar">
      <button id="new-chat-btn" class="toolbar-btn" type="button" title="New chat">+ New chat</button>
      <button id="clear-ctx-btn" class="toolbar-btn" type="button" title="Clear conversation, context files, and input">Clear all</button>
    </div>
    <div id="live-edits" class="live-edits" style="display:none;"></div>
    <div id="context-bar">
      <div id="context-list"></div>
    </div>
    <div class="composer-box">
      <textarea id="prompt-input" placeholder="Ask anything…" rows="1" autocomplete="off" spellcheck="true"></textarea>
      <button id="send-btn" class="send-btn" type="button" title="Send (Ctrl+Enter)">
        <span class="send-icon">&#8593;</span>
      </button>
    </div>
    <div id="bottom-bar">
      <div id="mode-pills" class="pill-row">
        <button class="pill pill--mode pill--active" data-mode="ask" type="button">Ask</button>
        <button class="pill pill--mode" data-mode="agent" type="button">Agent</button>
        <button class="pill pill--mode" data-mode="spec+agent" type="button">Spec+Agent</button>
      </div>
      <div id="provider-pills" class="pill-row"></div>
      <button id="config-btn" class="icon-btn" type="button" title="Settings">&#9881;</button>
    </div>
    <div id="model-bar">
      <div id="model-pills" class="pill-row"></div>
      <div id="agent-actions">
        <button id="revert-btn" class="toolbar-btn" type="button" title="Revert agent file changes" disabled>Revert</button>
        <button id="terminal-btn" class="toolbar-btn" type="button" title="Open Harness terminal">Terminal</button>
      </div>
    </div>
    <span id="token-footer" class="token-footer"></span>
  </div>
</div>`;
}

function bindRefs(): void {
  messagesEl = document.getElementById('messages') as HTMLDivElement;
  inputEl = document.getElementById('prompt-input') as HTMLTextAreaElement;
  sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
  providerPills = document.getElementById('provider-pills') as HTMLDivElement;
  modelPills = document.getElementById('model-pills') as HTMLDivElement;
  liveEditsEl = document.getElementById('live-edits') as HTMLDivElement;
  revertBtn = document.getElementById('revert-btn') as HTMLButtonElement;
  terminalBtn = document.getElementById('terminal-btn') as HTMLButtonElement;
  clearCtxBtn = document.getElementById('clear-ctx-btn') as HTMLButtonElement;
  newChatBtn = document.getElementById('new-chat-btn') as HTMLButtonElement;
  contextList = document.getElementById('context-list') as HTMLDivElement;
  configBtn = document.getElementById('config-btn') as HTMLButtonElement;
  slashPopover = document.getElementById('slash-popover') as HTMLDivElement;
  tokenFooter = document.getElementById('token-footer') as HTMLSpanElement;
}

// ---------------------------------------------------------------------------
// File references (Cursor-style)
// ---------------------------------------------------------------------------

interface FileRef {
  path: string;
  line?: number;
  column?: number;
}

function parseFileRef(text: string): FileRef | null {
  const trimmed = text.trim();
  const re = new RegExp(
    `^((?:[A-Za-z]:[\\\\/])?[\\w./\\\\@-]+\\.(?:${FILE_EXTENSIONS}))(?:#L?(\\d+))?(?::(\\d+))?(?::(\\d+))?$`,
    'i',
  );
  const m = trimmed.match(re);
  if (!m?.[1]) return null;
  return {
    path: m[1].replace(/\\/g, '/'),
    line: m[2] ? parseInt(m[2], 10) : m[3] ? parseInt(m[3], 10) : undefined,
    column: m[4] ? parseInt(m[4], 10) : undefined,
  };
}

function fileRefHtml(ref: FileRef, label?: string): string {
  const display = label ?? (ref.line ? `${basename(ref.path)}:${ref.line}` : basename(ref.path));
  const attrs = [
    `class="file-ref"`,
    `href="#"`,
    `data-path="${escapeAttr(ref.path)}"`,
    ref.line ? `data-line="${ref.line}"` : '',
    ref.column ? `data-column="${ref.column}"` : '',
  ].filter(Boolean).join(' ');
  return `<a ${attrs} title="${escapeAttr(ref.path)}">${escapeHtml(display)}</a>`;
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? p;
}

function linkifyFileRefs(html: string): string {
  // Linkify <code>path:line</code> inside markdown output
  html = html.replace(/<code>([^<]+)<\/code>/g, (full, code: string) => {
    const ref = parseFileRef(code);
    if (ref) return fileRefHtml(ref, code.trim());
    return full;
  });

  // Linkify plain path:line in text (avoid attributes and existing links)
  const pathRe = new RegExp(
    `(^|[^"'>])((?:[A-Za-z]:[\\\\/])?[\\w./\\\\@-]+\\.(?:${FILE_EXTENSIONS})):(\\d+)(?::(\\d+))?`,
    'gi',
  );
  html = html.replace(pathRe, (match, before: string, filePath: string, line: string, col?: string) => {
    if (before.includes('data-path=')) return match;
    const ref: FileRef = {
      path: filePath.replace(/\\/g, '/'),
      line: parseInt(line, 10),
      column: col ? parseInt(col, 10) : undefined,
    };
    return `${before}${fileRefHtml(ref)}`;
  });

  return html;
}

function renderMarkdown(content: string): string {
  let html = marked.parse(content) as string;
  html = html.replace(/<pre><code/g, '<div class="code-block"><button class="code-copy-btn" type="button">Copy</button><pre><code')
    .replace(/<\/code><\/pre>/g, '</code></pre></div>');
  return linkifyFileRefs(html);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderMessages(): void {
  if (state.history.length === 0) {
    renderEmptyState();
    return;
  }
  messagesEl.innerHTML = '';
  for (const msg of state.history) {
    messagesEl.appendChild(buildMessageEl(msg));
  }
  scrollToBottom();
}

function renderEmptyState(): void {
  messagesEl.innerHTML = /* html */`
    <div class="empty-state">
      <p class="empty-title">Harness of AI</p>
      <p class="empty-sub">Ask a question or describe a change. Pick a provider below.</p>
    </div>`;
}

function buildMessageEl(msg: ChatMessage): HTMLElement {
  const el = document.createElement('div');
  el.className = `msg msg--${msg.role}`;
  el.dataset['messageId'] = msg.id;

  if (msg.role === 'user') {
    el.innerHTML = `<div class="msg__body user-text">${escapeHtml(msg.content)}</div>`;
  } else {
    const agentId = msg.agent;
    const meta =
      agentId && AGENT_META[agentId]
        ? AGENT_META[agentId]
        : state.selectedAgent === 'auto'
          ? AUTO_META
          : { short: 'AI', color: '#888', label: String(state.selectedAgent) };
    const bodyHtml = msg.streaming
      ? '<span class="typing"><span></span><span></span><span></span></span>'
      : renderMarkdown(msg.content);

    el.innerHTML = /* html */`
      <div class="msg__label" style="color:${meta.color}">${meta.short}</div>
      <div class="msg__body markdown-body">${bodyHtml}</div>
      ${msg.error ? `<div class="msg__error">${escapeHtml(msg.error)}</div>` : ''}`;
  }

  return el;
}

function appendChunkToMessage(messageId: string, chunk: string): void {
  const msgEl = messagesEl.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;
  const body = msgEl.querySelector('.msg__body') as HTMLElement;
  if (!body) return;

  const typing = body.querySelector('.typing');
  if (typing) {
    body.classList.add('markdown-body');
    body.dataset['raw'] = '';
    typing.remove();
  }

  body.dataset['raw'] = (body.dataset['raw'] ?? '') + chunk;
  body.innerHTML = renderMarkdown(body.dataset['raw']);
  bindCodeCopyButtons(body);
  scrollToBottom();
}

function showAutoRouteNotice(route: ChatAutoRoutedPayload): void {
  state.lastAutoRoute = route;
  const meta = AGENT_META[route.agent];
  const notice = document.createElement('div');
  notice.className = 'auto-route-notice';
  notice.setAttribute('aria-live', 'polite');
  notice.innerHTML = /* html */`
    <span class="auto-route-notice__badge" style="border-color:${meta.color};color:${meta.color}">
      Auto → ${escapeHtml(meta.short)}
    </span>
    <span class="auto-route-notice__reason">${escapeHtml(route.reason)}</span>`;
  messagesEl.appendChild(notice);
  scrollToBottom();
}

function finalizeMessage(messageId: string): void {
  const msgEl = messagesEl.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;
  msgEl.querySelector('.typing')?.remove();
  const body = msgEl.querySelector('.msg__body') as HTMLElement;
  if (body?.dataset['raw'] !== undefined) {
    body.innerHTML = renderMarkdown(body.dataset['raw'] ?? '');
    bindCodeCopyButtons(body);
  }
}

function bindCodeCopyButtons(root: ParentNode): void {
  root.querySelectorAll('.code-copy-btn').forEach(btn => {
    (btn as HTMLButtonElement).onclick = () => copyCode(btn as HTMLButtonElement);
  });
}

function renderContext(): void {
  contextList.innerHTML = '';
  for (const item of state.context) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ctx-chip file-ref';
    chip.dataset['path'] = item.absolutePath;
    chip.title = item.absolutePath;
    chip.innerHTML = `<span class="ctx-chip__name">${escapeHtml(item.label)}</span>
      <span class="ctx-chip__x" data-path="${escapeAttr(item.absolutePath)}">&#10005;</span>`;
    chip.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('ctx-chip__x')) {
        e.stopPropagation();
        postMessage({ command: 'removeContext', payload: { absolutePath: item.absolutePath } });
      } else {
        postMessage({ command: 'openFile', payload: { path: item.absolutePath } });
      }
    });
    contextList.appendChild(chip);
  }
  const bar = document.getElementById('context-bar')!;
  bar.style.display = state.context.length > 0 ? 'flex' : 'none';
}

function modelAgentKey(): AgentId {
  if (state.selectedAgent !== 'auto') {
    return state.selectedAgent;
  }
  return state.lastAutoRoute?.agent ?? 'copilot';
}

function renderModelPills(): void {
  modelPills.innerHTML = '';
  const agent = modelAgentKey();
  const options = state.providerModels[agent] ?? [{ id: 'auto', label: 'LLM Auto' }];

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'pill pill--model' + (opt.id === state.selectedModel ? ' pill--active' : '');
    btn.dataset['model'] = opt.id;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => selectModel(opt.id));
    modelPills.appendChild(btn);
  }
}

function selectModel(modelId: string): void {
  if (state.selectedModel === modelId) return;
  state.selectedModel = modelId;
  renderModelPills();
  postMessage({ command: 'selectModel', payload: { model: modelId } });
}

function renderLiveEdits(): void {
  if (state.liveEdits.length === 0) {
    liveEditsEl.style.display = 'none';
    liveEditsEl.innerHTML = '';
    return;
  }
  liveEditsEl.style.display = 'block';
  const items = state.liveEdits
    .filter((e) => e.phase === 'after' || e.phase === 'before')
    .slice(-8)
    .map((e) => {
      const name = e.path ? basename(e.path) : e.tool;
      const verb = e.phase === 'before' ? 'Editing' : 'Edited';
      const preview = e.preview
        ? `<pre class="live-edits__preview">${escapeHtml(e.preview)}</pre>`
        : '';
      return `<div class="live-edits__item" data-path="${escapeAttr(e.path)}">
        <span class="live-edits__label">${verb} <strong>${escapeHtml(name)}</strong></span>
        ${preview}
      </div>`;
    })
    .join('');
  liveEditsEl.innerHTML = `<div class="live-edits__title">Live edits</div>${items}`;
  liveEditsEl.querySelectorAll('.live-edits__item').forEach((el) => {
    el.addEventListener('click', () => {
      const p = (el as HTMLElement).dataset['path'];
      if (p) postMessage({ command: 'openFile', payload: { path: p } });
    });
  });
}

function updateRevertButton(): void {
  revertBtn.disabled = !state.canRevert;
}

function renderProviderPills(): void {
  providerPills.innerHTML = '';

  const autoBtn = document.createElement('button');
  autoBtn.type = 'button';
  autoBtn.className =
    'pill pill--provider' + (state.selectedAgent === 'auto' ? ' pill--active' : '');
  autoBtn.dataset['agent'] = 'auto';
  autoBtn.title = AUTO_META.label;
  autoBtn.innerHTML = `<span class="pill-dot" style="background:${AUTO_META.color}"></span>${AUTO_META.short}`;
  autoBtn.addEventListener('click', () => selectAgent('auto'));
  providerPills.appendChild(autoBtn);

  const list = state.agents.length > 0
    ? state.agents
    : (Object.keys(AGENT_META) as AgentId[]).map(id => ({ id, label: AGENT_META[id].short }));

  for (const agent of list) {
    const id = agent.id as AgentId;
    const meta = AGENT_META[id] ?? { short: id, color: '#888', label: id };
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill pill--provider' + (id === state.selectedAgent ? ' pill--active' : '');
    btn.dataset['agent'] = id;
    btn.title = meta.label;
    btn.innerHTML = `<span class="pill-dot" style="background:${meta.color}"></span>${meta.short}`;
    btn.addEventListener('click', () => selectAgent(id));
    providerPills.appendChild(btn);
  }
}

function selectAgent(agentId: AgentSelectionId): void {
  if (state.selectedAgent === agentId) return;
  state.selectedAgent = agentId;
  renderProviderPills();
  renderModelPills();
  postMessage({ command: 'selectAgent', payload: { agent: agentId } });
}

function updateModePills(): void {
  document.querySelectorAll('.pill--mode').forEach(btn => {
    const b = btn as HTMLElement;
    b.classList.toggle('pill--active', b.dataset['mode'] === state.selectedMode);
  });
  const placeholders: Record<CopilotMode, string> = {
    ask: 'Ask anything…',
    agent: 'Describe what to build or change…',
    'spec+agent': 'Task + spec context…',
  };
  inputEl.placeholder = placeholders[state.selectedMode];
}

function setStreaming(streaming: boolean): void {
  state.isStreaming = streaming;
  sendBtn.classList.toggle('send-btn--stop', streaming);
  sendBtn.title = streaming ? 'Stop' : 'Send (Ctrl+Enter)';
  sendBtn.querySelector('.send-icon')!.textContent = streaming ? '■' : '↑';
}

function updateTokenFooter(): void {
  if (state.sessionTokens > 0) {
    tokenFooter.textContent = `${state.sessionTokens.toLocaleString()} tokens`;
    tokenFooter.style.display = 'block';
  } else {
    tokenFooter.style.display = 'none';
  }
}

function scrollToBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResize(): void {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

function showSlashPopover(query: string): void {
  const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(query) || query === '/');
  if (matches.length === 0) { hideSlashPopover(); return; }
  slashPopover.innerHTML = matches.map(c =>
    `<div class="slash-item" data-cmd="${c.cmd}">${c.hint}</div>`,
  ).join('');
  slashPopover.style.display = 'block';
  slashPopover.querySelectorAll('.slash-item').forEach(item => {
    item.addEventListener('click', () => {
      inputEl.value = (item as HTMLElement).dataset['cmd'] + ' ';
      inputEl.focus();
      hideSlashPopover();
    });
  });
}

function hideSlashPopover(): void {
  slashPopover.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/** Clear chat, context files, and input — extension is source of truth via chatCleared + contextUpdated. */
function clearAll(): void {
  inputEl.value = '';
  autoResize();
  hideSlashPopover();
  if (state.isStreaming) {
    postMessage({ command: 'stopStream' });
  }
  postMessage({ command: 'clearContext' });
}

function startNewChat(): void {
  inputEl.value = '';
  autoResize();
  hideSlashPopover();
  if (state.isStreaming) {
    postMessage({ command: 'stopStream' });
  }
  postMessage({ command: 'newChat' });
}

function sendMessage(): void {
  if (state.isStreaming) {
    postMessage({ command: 'stopStream' });
    return;
  }

  const text = inputEl.value.trim();
  if (!text) return;

  if (text.startsWith('/clear')) {
    startNewChat();
    return;
  }
  if (text.startsWith('/agent ')) {
    const agentId = text.slice(7).trim() as AgentSelectionId;
    if (agentId === 'auto' || AGENT_META[agentId as AgentId]) selectAgent(agentId);
    inputEl.value = '';
    autoResize();
    return;
  }

  inputEl.value = '';
  autoResize();
  hideSlashPopover();
  setStreaming(true);
  postMessage({
    command: 'sendMessage',
    payload: { text, agent: state.selectedAgent, mode: state.selectedMode },
  });
}

// ---------------------------------------------------------------------------
// Events
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
    const slashMatch = inputEl.value.match(/^(\/\S*)$/);
    if (slashMatch) showSlashPopover(slashMatch[1]);
    else hideSlashPopover();
  });

  document.querySelectorAll('.pill--mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset['mode'] as CopilotMode;
      if (mode && mode !== state.selectedMode) {
        state.selectedMode = mode;
        updateModePills();
        postMessage({ command: 'selectMode', payload: { mode } });
      }
    });
  });

  clearCtxBtn.addEventListener('click', () => clearAll());
  newChatBtn.addEventListener('click', () => startNewChat());
  configBtn.addEventListener('click', () => postMessage({ command: 'openConfig' }));
  revertBtn.addEventListener('click', () => postMessage({ command: 'revertAgentChanges' }));
  terminalBtn.addEventListener('click', () => postMessage({ command: 'focusAgentTerminal' }));

  messagesEl.addEventListener('click', (e) => {
    const ref = (e.target as HTMLElement).closest('.file-ref') as HTMLElement | null;
    if (!ref || ref.classList.contains('ctx-chip__x')) return;
    e.preventDefault();
    const path = ref.dataset['path'];
    if (!path) return;
    const line = ref.dataset['line'] ? parseInt(ref.dataset['line'], 10) : undefined;
    const column = ref.dataset['column'] ? parseInt(ref.dataset['column'], 10) : undefined;
    postMessage({ command: 'openFile', payload: { path, line, column } });
  });

  document.addEventListener('click', (e) => {
    if (!slashPopover.contains(e.target as Node) && e.target !== inputEl) {
      hideSlashPopover();
    }
  });
}

// ---------------------------------------------------------------------------
// Extension messages
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
      state.lastAutoRoute = p.lastAutoRoute;
      state.selectedModel = p.selectedModel ?? 'auto';
      state.providerModels = p.providerModels ?? PROVIDER_MODEL_OPTIONS;
      state.liveEdits = p.liveEdits ?? [];
      state.canRevert = p.canRevert ?? false;
      renderProviderPills();
      renderModelPills();
      renderLiveEdits();
      updateRevertButton();
      renderMessages();
      renderContext();
      updateModePills();
      break;
    }
    case 'autoRouted': {
      const route = msg.payload as ChatAutoRoutedPayload;
      state.lastAutoRoute = route;
      showAutoRouteNotice(route);
      renderModelPills();
      break;
    }
    case 'modelChanged': {
      const p = msg.payload as {
        selectedModel: string;
        agent: AgentId;
        providerModels: Record<AgentId, ProviderModelOption[]>;
      };
      state.selectedModel = p.selectedModel;
      state.providerModels = p.providerModels;
      renderModelPills();
      break;
    }
    case 'liveEditsUpdated': {
      const p = msg.payload as { edits: LiveEditEntry[] };
      state.liveEdits = p.edits;
      renderLiveEdits();
      break;
    }
    case 'revertAvailable': {
      const p = msg.payload as { canRevert: boolean };
      state.canRevert = p.canRevert;
      updateRevertButton();
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
        scrollToBottom();
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
      if (errEl && !errEl.querySelector('.msg__error')) {
        const errDiv = document.createElement('div');
        errDiv.className = 'msg__error';
        errDiv.textContent = p.error;
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
    case 'chatCleared':
      state.history = [];
      state.sessionTokens = 0;
      state.isStreaming = false;
      state.lastAutoRoute = undefined;
      state.liveEdits = [];
      state.canRevert = false;
      setStreaming(false);
      updateTokenFooter();
      renderLiveEdits();
      updateRevertButton();
      renderMessages();
      break;
    case 'agentChanged': {
      const p = msg.payload as { agent: AgentSelectionId };
      state.selectedAgent = p.agent;
      renderProviderPills();
      renderModelPills();
      break;
    }
    case 'modeChanged': {
      const p = msg.payload as { mode: CopilotMode };
      state.selectedMode = p.mode;
      updateModePills();
      break;
    }
    case 'tokenUsage': {
      const p = msg.payload as TokenUsagePayload;
      state.sessionTokens = p.sessionTokens;
      updateTokenFooter();
      break;
    }
    case 'error':
      console.error('Harness error:', msg.payload);
      break;
  }
});

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function postMessage(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#039;');
}

(window as unknown as Record<string, unknown>)['copyCode'] = function copyCode(btn: HTMLButtonElement): void {
  const block = btn.closest('.code-block');
  const code = block?.querySelector('code');
  if (code) navigator.clipboard.writeText(code.textContent ?? '').catch(() => null);
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
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
#root { display: flex; flex-direction: column; height: 100vh; }

#messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  padding: 24px;
  gap: 6px;
}
.empty-title { font-size: 15px; font-weight: 600; color: var(--vscode-foreground); }
.empty-sub { font-size: 12px; line-height: 1.5; max-width: 260px; }

.msg { display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
.msg--user { align-items: flex-end; }
.msg--assistant { align-items: flex-start; }

.msg__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.user-text {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 12px;
  padding: 8px 12px;
  max-width: 92%;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  font-size: var(--vscode-font-size);
}

.msg__body {
  line-height: 1.6;
  font-size: var(--vscode-font-size);
  word-break: break-word;
  max-width: 100%;
}
.markdown-body p { margin: 0 0 8px; }
.markdown-body p:last-child { margin-bottom: 0; }
.markdown-body ul, .markdown-body ol { padding-left: 18px; margin: 4px 0 8px; }
.markdown-body code {
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  background: var(--vscode-textCodeBlock-background);
  padding: 1px 4px;
  border-radius: 3px;
}
.code-block { position: relative; margin: 8px 0; }
.code-block pre {
  background: var(--vscode-textCodeBlock-background);
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  line-height: 1.45;
}
.code-block pre code { background: none; padding: 0; }
.code-copy-btn {
  position: absolute; top: 6px; right: 6px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none; border-radius: 3px; padding: 2px 8px;
  font-size: 10px; cursor: pointer; opacity: 0;
}
.code-block:hover .code-copy-btn { opacity: 1; }

.file-ref {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.92em;
  cursor: pointer;
  border-bottom: 1px solid transparent;
}
.file-ref:hover {
  border-bottom-color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

.auto-route-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 12px;
  padding: 8px 10px;
  font-size: 12px;
  border-radius: 6px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border: 1px solid var(--vscode-widget-border);
}
.auto-route-notice__badge {
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid;
}
.auto-route-notice__reason {
  color: var(--vscode-descriptionForeground);
  flex: 1;
  min-width: 120px;
}

.msg__error {
  font-size: 12px;
  color: var(--vscode-errorForeground);
  padding: 6px 8px;
  background: var(--vscode-inputValidation-errorBackground);
  border-radius: 4px;
}

.typing { display: inline-flex; gap: 4px; padding: 4px 0; }
.typing span {
  width: 5px; height: 5px;
  background: var(--vscode-descriptionForeground);
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite;
}
.typing span:nth-child(2) { animation-delay: 0.15s; }
.typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes pulse {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

#composer {
  flex-shrink: 0;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
  background: var(--vscode-sideBar-background);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

#composer-toolbar {
  display: flex;
  gap: 6px;
  padding: 0 2px 2px;
}
.toolbar-btn {
  background: none;
  border: 1px solid var(--vscode-widget-border, transparent);
  color: var(--vscode-descriptionForeground);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: var(--vscode-font-family);
  cursor: pointer;
  line-height: 18px;
}
.toolbar-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

#context-bar {
  display: none;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 0 2px 4px;
}
.ctx-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border: none;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
  font-family: var(--vscode-editor-font-family);
}
.ctx-chip__x { opacity: 0.6; font-size: 10px; padding: 0 2px; }
.ctx-chip__x:hover { opacity: 1; }

.composer-box {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 8px;
  padding: 6px 6px 6px 10px;
}
.composer-box:focus-within {
  border-color: var(--vscode-focusBorder);
}
#prompt-input {
  flex: 1;
  min-height: 22px;
  max-height: 160px;
  resize: none;
  border: none;
  background: transparent;
  color: var(--vscode-input-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  line-height: 1.5;
  outline: none;
}
.send-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.send-btn:hover { background: var(--vscode-button-hoverBackground); }
.send-btn--stop {
  background: var(--vscode-inputValidation-errorBackground);
  color: var(--vscode-errorForeground);
}
.send-icon { font-size: 14px; line-height: 1; }

#bottom-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 0 2px;
}
.pill-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
#provider-pills { flex: 1; min-width: 0; }

#model-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 4px 2px 0;
}
#model-pills { flex: 1; min-width: 0; }
#agent-actions { display: flex; gap: 4px; flex-shrink: 0; }
.pill--model { font-size: 10px; padding: 2px 6px; }

.live-edits {
  max-height: 120px;
  overflow-y: auto;
  margin: 0 2px 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border: 1px solid var(--vscode-widget-border, transparent);
  font-size: 11px;
}
.live-edits__title {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--vscode-foreground);
}
.live-edits__item {
  cursor: pointer;
  padding: 4px 0;
  border-bottom: 1px solid var(--vscode-widget-border, transparent);
}
.live-edits__item:last-child { border-bottom: none; }
.live-edits__item:hover { opacity: 0.9; }
.live-edits__preview {
  margin-top: 2px;
  max-height: 48px;
  overflow: hidden;
  font-size: 10px;
  opacity: 0.85;
  white-space: pre-wrap;
  font-family: var(--vscode-editor-font-family);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--vscode-widget-border, transparent);
  background: transparent;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  font-family: var(--vscode-font-family);
  cursor: pointer;
  white-space: nowrap;
  line-height: 18px;
}
.pill:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}
.pill--active {
  background: var(--vscode-input-background);
  color: var(--vscode-foreground);
  border-color: var(--vscode-focusBorder);
}
.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.icon-btn {
  background: none;
  border: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 13px;
  opacity: 0.7;
  flex-shrink: 0;
}
.icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

.token-footer {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  padding: 0 4px;
  display: none;
}

.slash-popover {
  position: absolute;
  bottom: 120px;
  left: 10px;
  right: 10px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 6px;
  z-index: 100;
  overflow: hidden;
}
.slash-item {
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}
.slash-item:hover { background: var(--vscode-list-hoverBackground); }
`;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

injectShell();
bindRefs();
bindEvents();
postMessage({ command: 'ready' });
