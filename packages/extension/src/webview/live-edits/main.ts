/**
 * Live Edits sidebar — before/after code preview for agent file writes.
 */
import type {
  ExtensionMessage,
  LiveEditEntry,
  LiveEditsPanelPayload,
  WebviewMessage,
} from '../../types';

const vscode = acquireVsCodeApi();

let root!: HTMLElement;
let edits: LiveEditEntry[] = [];
let activePath: string | undefined;
let canRevert = false;

function post(cmd: WebviewMessage['command'], payload?: unknown): void {
  vscode.postMessage({ command: cmd, payload } satisfies WebviewMessage);
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? p;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function groupByPath(list: LiveEditEntry[]): Map<string, { before?: string | null; after?: string }> {
  const map = new Map<string, { before?: string | null; after?: string }>();
  for (const e of list) {
    if (!e.path) continue;
    const row = map.get(e.path) ?? {};
    if (e.phase === 'before' || e.beforeContent !== undefined) {
      row.before = e.beforeContent ?? e.preview ?? row.before;
    }
    if (e.phase === 'after') {
      row.after = e.afterContent ?? e.preview ?? row.after;
    }
    map.set(e.path, row);
  }
  return map;
}

function render(): void {
  const files = groupByPath(edits);
  const paths = [...files.keys()];

  if (paths.length === 0) {
    root.innerHTML = `
      <div class="empty">
        <p class="empty-title">No live edits yet</p>
        <p class="empty-sub">Use <strong>Copilot</strong> provider with <strong>Agent</strong> mode to edit files in this workspace. Edits appear here in real time.</p>
      </div>`;
    return;
  }

  const fileList = paths
    .map((p) => {
      const active = p === activePath ? ' file-tab--active' : '';
      return `<button type="button" class="file-tab${active}" data-path="${escapeHtml(p)}">${escapeHtml(basename(p))}</button>`;
    })
    .join('');

  const current = activePath && files.has(activePath) ? activePath : paths[paths.length - 1];
  const row = current ? files.get(current) : undefined;
  const before = row?.before ?? '(new file)';
  const after = row?.after ?? '';

  root.innerHTML = `
    <header class="header">
      <span class="header-title">Live edits</span>
      <button type="button" id="revert-btn" class="btn" ${canRevert ? '' : 'disabled'}>Revert all</button>
    </header>
    <div class="file-tabs">${fileList}</div>
    <div class="diff-panels">
      <section class="panel">
        <h3>Before</h3>
        <pre class="code"><code>${escapeHtml(before)}</code></pre>
      </section>
      <section class="panel panel--after">
        <h3>After</h3>
        <pre class="code"><code>${escapeHtml(after)}</code></pre>
      </section>
    </div>
    <footer class="footer">
      <button type="button" id="open-file-btn" class="btn btn--secondary">Open in editor</button>
    </footer>`;

  root.querySelector('#revert-btn')?.addEventListener('click', () => {
    post('revertAgentChanges');
  });
  root.querySelector('#open-file-btn')?.addEventListener('click', () => {
    if (current) post('openFile', { path: current });
  });
  root.querySelectorAll('.file-tab').forEach((el) => {
    el.addEventListener('click', () => {
      activePath = (el as HTMLElement).dataset['path'];
      render();
    });
  });
}

const CSS = `
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
  height: 100%;
  padding: 8px;
  gap: 8px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.header-title { font-weight: 600; font-size: 12px; }
.btn {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--vscode-button-border, transparent);
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
}
.btn:disabled { opacity: 0.4; cursor: default; }
.btn--secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}
.file-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.file-tab {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--vscode-widget-border, transparent);
  background: var(--vscode-input-background);
  color: var(--vscode-foreground);
  cursor: pointer;
}
.file-tab--active {
  border-color: var(--vscode-focusBorder);
}
.diff-panels {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}
.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--vscode-widget-border, transparent);
  border-radius: 6px;
  overflow: hidden;
}
.panel h3 {
  font-size: 10px;
  text-transform: uppercase;
  padding: 4px 8px;
  background: var(--vscode-editorGroupHeader-tabsBackground);
  color: var(--vscode-descriptionForeground);
}
.panel--after h3 { color: var(--vscode-gitDecoration-addedResourceForeground, #3fb950); }
.code {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 8px;
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--vscode-editor-background);
}
.footer { flex-shrink: 0; }
.empty {
  padding: 16px 8px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
}
.empty-title { font-weight: 600; color: var(--vscode-foreground); margin-bottom: 8px; }
.empty-sub { font-size: 11px; line-height: 1.5; }
`;

function init(): void {
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  const bodyRoot = document.createElement('div');
  bodyRoot.id = 'root';
  document.body.appendChild(bodyRoot);
  root = bodyRoot;
  post('ready');
}

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;
  if (msg.command === 'liveEditsPanel') {
    const p = msg.payload as LiveEditsPanelPayload;
    edits = p.edits;
    canRevert = p.canRevert;
    if (p.activePath) activePath = p.activePath;
    render();
  }
});

init();
