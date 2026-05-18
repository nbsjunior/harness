import {
  provideVSCodeDesignSystem,
  vsCodeButton,
  vsCodeTextArea,
  vsCodeDropdown,
  vsCodeOption,
  vsCodeDivider,
  vsCodeBadge,
  vsCodeProgressRing,
  vsCodeTag,
} from '@vscode/webview-ui-toolkit';
import type {
  AgentDescriptor,
  AgentId,
  ChatMessage,
  ContextItem,
  ExtensionMessage,
  InitializePayload,
  WebviewMessage,
} from '../../types';

// Register VSCode Design System components
provideVSCodeDesignSystem().register(
  vsCodeButton(),
  vsCodeTextArea(),
  vsCodeDropdown(),
  vsCodeOption(),
  vsCodeDivider(),
  vsCodeBadge(),
  vsCodeProgressRing(),
  vsCodeTag(),
);

// Acquire the VSCode API handle (must be called exactly once per webview)
const vscode = acquireVsCodeApi<{ history: ChatMessage[]; agent: AgentId }>();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface State {
  history: ChatMessage[];
  context: ContextItem[];
  agents: AgentDescriptor[];
  selectedAgent: AgentId;
  isStreaming: boolean;
}

const state: State = {
  history: [],
  context: [],
  agents: [],
  selectedAgent: 'copilot',
  isStreaming: false,
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const messagesEl = document.getElementById('messages') as HTMLDivElement;
const inputEl = document.getElementById('prompt-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const agentDropdown = document.getElementById('agent-dropdown') as HTMLSelectElement;
const contextBadge = document.getElementById('context-badge') as HTMLElement;
const clearCtxBtn = document.getElementById('clear-ctx-btn') as HTMLButtonElement;
const contextList = document.getElementById('context-list') as HTMLDivElement;
const progressRing = document.getElementById('progress-ring') as HTMLElement;
const configBtn = document.getElementById('config-btn') as HTMLButtonElement;

// ---------------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------------

function renderMessages(): void {
  messagesEl.innerHTML = '';

  if (state.history.length === 0) {
    messagesEl.innerHTML = `
      <div class="empty-state">
        <p>Start a conversation with your AI agent.</p>
        <p class="hint">Use <kbd>Ctrl+Enter</kbd> to send.</p>
      </div>`;
    return;
  }

  for (const msg of state.history) {
    messagesEl.appendChild(buildMessageEl(msg));
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function buildMessageEl(msg: ChatMessage): HTMLElement {
  const el = document.createElement('div');
  el.className = `message message--${msg.role}`;
  el.dataset['messageId'] = msg.id;

  const header = document.createElement('div');
  header.className = 'message__header';
  header.innerHTML = `
    <span class="message__role">${msg.role === 'user' ? 'You' : msg.agent ?? 'Agent'}</span>
    <span class="message__time">${new Date(msg.timestamp).toLocaleTimeString()}</span>`;

  const body = document.createElement('div');
  body.className = 'message__body';
  body.textContent = msg.content;

  if (msg.streaming) {
    const cursor = document.createElement('span');
    cursor.className = 'message__cursor';
    cursor.textContent = '▋';
    body.appendChild(cursor);
  }

  if (msg.error) {
    const errEl = document.createElement('div');
    errEl.className = 'message__error';
    errEl.textContent = `Error: ${msg.error}`;
    el.appendChild(header);
    el.appendChild(body);
    el.appendChild(errEl);
  } else {
    el.appendChild(header);
    el.appendChild(body);
  }

  return el;
}

function appendChunkToMessage(messageId: string, chunk: string): void {
  const el = messagesEl.querySelector(`[data-message-id="${messageId}"] .message__body`);
  if (!el) {
    return;
  }

  // Remove cursor before appending
  const cursor = el.querySelector('.message__cursor');
  if (cursor) {
    el.removeChild(cursor);
  }

  el.appendChild(document.createTextNode(chunk));

  // Re-append cursor
  const newCursor = document.createElement('span');
  newCursor.className = 'message__cursor';
  newCursor.textContent = '▋';
  el.appendChild(newCursor);

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finalizeMessage(messageId: string): void {
  const el = messagesEl.querySelector(`[data-message-id="${messageId}"] .message__body`);
  if (!el) {
    return;
  }
  const cursor = el.querySelector('.message__cursor');
  if (cursor) {
    el.removeChild(cursor);
  }
}

function renderContext(): void {
  const count = state.context.length;
  contextBadge.textContent = count > 0 ? String(count) : '';
  contextBadge.style.display = count > 0 ? '' : 'none';

  contextList.innerHTML = '';
  for (const item of state.context) {
    const tag = document.createElement('vscode-tag');
    tag.textContent = item.label;
    tag.title = item.uri;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ctx-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove from context';
    removeBtn.addEventListener('click', () => {
      postMessage({ command: 'removeContext', payload: { uri: item.uri } });
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'ctx-item';
    wrapper.appendChild(tag);
    wrapper.appendChild(removeBtn);
    contextList.appendChild(wrapper);
  }
}

function renderAgentDropdown(): void {
  agentDropdown.innerHTML = '';
  for (const agent of state.agents) {
    const opt = document.createElement('vscode-option');
    opt.value = agent.id;
    opt.textContent = agent.label;
    if (agent.id === state.selectedAgent) {
      opt.setAttribute('selected', '');
    }
    agentDropdown.appendChild(opt);
  }
}

function setStreaming(streaming: boolean): void {
  state.isStreaming = streaming;
  progressRing.style.display = streaming ? 'block' : 'none';
  sendBtn.setAttribute('disabled', streaming ? '' : 'false');
  if (!streaming) {
    sendBtn.removeAttribute('disabled');
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function sendMessage(): void {
  const text = inputEl.value.trim();
  if (!text || state.isStreaming) {
    return;
  }

  inputEl.value = '';
  setStreaming(true);

  postMessage({
    command: 'sendMessage',
    payload: { text, agent: state.selectedAgent },
  });
}

sendBtn.addEventListener('click', sendMessage);

inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

agentDropdown.addEventListener('change', () => {
  const selectedAgent = agentDropdown.value as AgentId;
  state.selectedAgent = selectedAgent;
  postMessage({ command: 'selectAgent', payload: { agent: selectedAgent } });
});

clearCtxBtn.addEventListener('click', () => {
  postMessage({ command: 'clearContext' });
});

configBtn.addEventListener('click', () => {
  postMessage({ command: 'openConfig' });
});

// ---------------------------------------------------------------------------
// Extension → Webview message handler
// ---------------------------------------------------------------------------

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  switch (msg.command) {
    case 'initialize': {
      const payload = msg.payload as InitializePayload;
      state.agents = payload.agents;
      state.selectedAgent = payload.agent;
      state.history = payload.history;
      state.context = payload.context;
      renderAgentDropdown();
      renderMessages();
      renderContext();
      break;
    }

    case 'appendChunk': {
      const payload = msg.payload as {
        messageId?: string;
        message?: ChatMessage;
        chunk?: string;
        done: boolean;
      };

      if (payload.message) {
        // Full new message being appended
        state.history.push(payload.message);
        messagesEl.appendChild(buildMessageEl(payload.message));
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (payload.messageId && payload.chunk !== undefined) {
        appendChunkToMessage(payload.messageId, payload.chunk);
      }
      break;
    }

    case 'messageComplete': {
      const payload = msg.payload as { messageId: string };
      const histMsg = state.history.find((m) => m.id === payload.messageId);
      if (histMsg) {
        histMsg.streaming = false;
      }
      finalizeMessage(payload.messageId);
      setStreaming(false);
      break;
    }

    case 'messageError': {
      const payload = msg.payload as { messageId: string; error: string };
      const histMsg = state.history.find((m) => m.id === payload.messageId);
      if (histMsg) {
        histMsg.streaming = false;
        histMsg.error = payload.error;
      }
      finalizeMessage(payload.messageId);
      setStreaming(false);

      const errEl = messagesEl.querySelector(`[data-message-id="${payload.messageId}"]`);
      if (errEl) {
        const errMsg = document.createElement('div');
        errMsg.className = 'message__error';
        errMsg.textContent = `Error: ${payload.error}`;
        errEl.appendChild(errMsg);
      }
      break;
    }

    case 'contextUpdated': {
      state.context = msg.payload as ContextItem[];
      renderContext();
      break;
    }

    case 'agentChanged': {
      const payload = msg.payload as { agent: AgentId };
      state.selectedAgent = payload.agent;
      renderAgentDropdown();
      break;
    }

    case 'error': {
      console.error('Harness extension error:', msg.payload);
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postMessage(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

// Signal that the webview is ready to receive the initialization payload
postMessage({ command: 'ready' });

// ---------------------------------------------------------------------------
// CSS injection (keeps the webview bundle self-contained)
// ---------------------------------------------------------------------------

const style = document.createElement('style');
style.textContent = /* css */ `
  body { padding: 0; }

  #toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
    background: var(--vscode-sideBar-background);
    flex-shrink: 0;
  }

  #agent-dropdown {
    flex: 1;
    min-width: 0;
  }

  #config-btn {
    flex-shrink: 0;
  }

  #context-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
    background: var(--vscode-sideBar-background);
    min-height: 36px;
    flex-shrink: 0;
    overflow-x: auto;
  }

  .ctx-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  #context-list {
    display: flex;
    gap: 4px;
    flex-wrap: nowrap;
    overflow-x: auto;
    flex: 1;
  }

  .ctx-item {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .ctx-remove {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
    opacity: 0.6;
  }
  .ctx-remove:hover { opacity: 1; }

  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    text-align: center;
    color: var(--vscode-descriptionForeground);
    margin-top: 40px;
  }
  .empty-state .hint {
    margin-top: 8px;
    font-size: 11px;
  }
  .empty-state kbd {
    background: var(--vscode-keybindingLabel-background);
    border: 1px solid var(--vscode-keybindingLabel-border);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 11px;
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    animation: fadeIn 0.15s ease;
  }
  .message--user {
    background: var(--vscode-editor-selectionBackground);
    align-self: flex-end;
    max-width: 88%;
  }
  .message--assistant {
    align-self: flex-start;
    max-width: 96%;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .message__header {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
  }

  .message__role { font-weight: 600; }

  .message__body {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--vscode-font-size);
    line-height: 1.5;
  }

  .message__cursor {
    display: inline-block;
    animation: blink 1s step-end infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }

  .message__error {
    margin-top: 4px;
    padding: 4px 8px;
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    border-radius: 4px;
    font-size: 11px;
    color: var(--vscode-errorForeground);
  }

  #input-area {
    padding: 8px 12px;
    border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  #prompt-input {
    width: 100%;
    resize: none;
    min-height: 60px;
    max-height: 150px;
  }

  #input-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  #progress-ring {
    display: none;
  }

  .kbd-hint {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
  }
`;
document.head.appendChild(style);

// Inject HTML structure (since the host page only has #root)
const root = document.getElementById('root')!;
root.innerHTML = /* html */ `
  <div id="toolbar">
    <vscode-dropdown id="agent-dropdown"></vscode-dropdown>
    <vscode-button id="config-btn" appearance="icon" title="Harness Settings">
      <span class="codicon codicon-settings-gear"></span>
    </vscode-button>
  </div>

  <div id="context-bar">
    <span class="ctx-label">Context</span>
    <div id="context-list"></div>
    <vscode-badge id="context-badge" style="display:none"></vscode-badge>
    <vscode-button id="clear-ctx-btn" appearance="icon" title="Clear context">
      <span class="codicon codicon-clear-all"></span>
    </vscode-button>
  </div>

  <div id="messages"></div>

  <div id="input-area">
    <vscode-text-area
      id="prompt-input"
      placeholder="Ask your agent… (Ctrl+Enter to send)"
      rows="3"
    ></vscode-text-area>
    <div id="input-actions">
      <span class="kbd-hint">Ctrl+Enter to send</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <vscode-progress-ring id="progress-ring"></vscode-progress-ring>
        <vscode-button id="send-btn">Send</vscode-button>
      </div>
    </div>
  </div>
`;

// Re-bind DOM references after innerHTML injection
Object.assign(window, {
  messagesEl: document.getElementById('messages'),
  inputEl: document.getElementById('prompt-input'),
  sendBtn: document.getElementById('send-btn'),
  agentDropdown: document.getElementById('agent-dropdown'),
  contextBadge: document.getElementById('context-badge'),
  clearCtxBtn: document.getElementById('clear-ctx-btn'),
  contextList: document.getElementById('context-list'),
  progressRing: document.getElementById('progress-ring'),
  configBtn: document.getElementById('config-btn'),
});
