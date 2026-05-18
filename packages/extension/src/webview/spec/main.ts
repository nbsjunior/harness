import {
  provideVSCodeDesignSystem,
  vsCodeButton,
  vsCodeTextField,
  vsCodeTextArea,
  vsCodeDropdown,
  vsCodeOption,
  vsCodeDivider,
  vsCodeBadge,
} from '@vscode/webview-ui-toolkit';
import type {
  AgentId,
  SpecDefinition,
  SpecKind,
  SpecTool,
  ExtensionMessage,
  WebviewMessage,
} from '../../types';

provideVSCodeDesignSystem().register(
  vsCodeButton(),
  vsCodeTextField(),
  vsCodeTextArea(),
  vsCodeDropdown(),
  vsCodeOption(),
  vsCodeDivider(),
  vsCodeBadge(),
);

const vscode = acquireVsCodeApi();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface State {
  specs: SpecDefinition[];
  editingSpec: SpecDefinition | null;
  isNew: boolean;
}

const state: State = {
  specs: [],
  editingSpec: null,
  isNew: false,
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(): void {
  const root = document.getElementById('root')!;

  if (state.editingSpec) {
    root.innerHTML = buildEditorHtml(state.editingSpec);
    bindEditorEvents();
  } else {
    root.innerHTML = buildListHtml(state.specs);
    bindListEvents();
  }
}

function buildListHtml(specs: SpecDefinition[]): string {
  const items =
    specs.length === 0
      ? `<div class="empty-state">
          <p>No specs found in <code>.harness/specs/</code>.</p>
          <p>Initialize the workspace first or create a new spec.</p>
        </div>`
      : specs
          .map(
            (spec) => `
          <div class="spec-item" data-path="${spec.filePath ?? ''}">
            <div class="spec-item__header">
              <vscode-badge>${spec.kind}</vscode-badge>
              <span class="spec-item__name">${spec.name}</span>
            </div>
            <div class="spec-item__desc">${spec.description || '<em>No description</em>'}</div>
            <div class="spec-item__actions">
              <vscode-button appearance="secondary" data-action="edit" data-path="${spec.filePath ?? ''}">Edit</vscode-button>
              <vscode-button appearance="secondary" data-action="delete" data-path="${spec.filePath ?? ''}">Delete</vscode-button>
            </div>
          </div>`,
          )
          .join('');

  return /* html */ `
    <div class="toolbar">
      <span class="toolbar__title">Specs</span>
      <vscode-button id="new-spec-btn" appearance="primary">+ New Spec</vscode-button>
    </div>
    <vscode-divider></vscode-divider>
    <div class="spec-list">${items}</div>`;
}

function buildEditorHtml(spec: SpecDefinition): string {
  const toolsHtml = (spec.tools ?? [])
    .map(
      (t, i) => `
      <div class="tool-row" data-index="${i}">
        <vscode-text-field class="tool-name" value="${t.name}" placeholder="Tool name"></vscode-text-field>
        <vscode-text-field class="tool-desc" value="${t.description}" placeholder="Description"></vscode-text-field>
        <vscode-button appearance="icon" class="tool-remove" data-index="${i}" title="Remove tool">×</vscode-button>
      </div>`,
    )
    .join('');

  const agentOptions: AgentId[] = ['copilot', 'devin', 'cursor', 'claude', 'kiro'];
  const kindOptions: SpecKind[] = ['Skill', 'Tool', 'Workflow'];

  return /* html */ `
    <div class="editor">
      <div class="editor__header">
        <vscode-button appearance="icon" id="back-btn" title="Back to list">←</vscode-button>
        <span class="editor__title">${state.isNew ? 'New Spec' : `Edit: ${spec.name}`}</span>
      </div>
      <vscode-divider></vscode-divider>

      <div class="editor__form">
        <label>Kind
          <vscode-dropdown id="spec-kind">
            ${kindOptions.map((k) => `<vscode-option value="${k}" ${spec.kind === k ? 'selected' : ''}>${k}</vscode-option>`).join('')}
          </vscode-dropdown>
        </label>

        <label>Name
          <vscode-text-field id="spec-name" value="${spec.name}" placeholder="e.g. code-review"></vscode-text-field>
        </label>

        <label>Description
          <vscode-text-area id="spec-desc" rows="3" placeholder="What does this spec do?">${spec.description}</vscode-text-area>
        </label>

        <vscode-divider></vscode-divider>
        <div class="section-label">Tools</div>
        <div id="tools-list">${toolsHtml}</div>
        <vscode-button appearance="secondary" id="add-tool-btn">+ Add Tool</vscode-button>

        <vscode-divider></vscode-divider>
        <div class="section-label">Agent Routing</div>
        <label>Preferred Agent
          <vscode-dropdown id="spec-preferred-agent">
            ${agentOptions.map((a) => `<vscode-option value="${a}" ${spec.agents?.preferred === a ? 'selected' : ''}>${a}</vscode-option>`).join('')}
          </vscode-dropdown>
        </label>
        <label>Fallback Agent
          <vscode-dropdown id="spec-fallback-agent">
            <vscode-option value="">None</vscode-option>
            ${agentOptions.map((a) => `<vscode-option value="${a}" ${spec.agents?.fallback === a ? 'selected' : ''}>${a}</vscode-option>`).join('')}
          </vscode-dropdown>
        </label>

        <vscode-divider></vscode-divider>
        <div class="editor__actions">
          <vscode-button id="save-spec-btn" appearance="primary">Save Spec</vscode-button>
          <vscode-button id="cancel-edit-btn" appearance="secondary">Cancel</vscode-button>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Event binding
// ---------------------------------------------------------------------------

function bindListEvents(): void {
  document.getElementById('new-spec-btn')?.addEventListener('click', () => {
    state.editingSpec = {
      kind: 'Skill',
      name: '',
      description: '',
      tools: [],
      agents: { preferred: 'copilot' },
    };
    state.isNew = true;
    render();
  });

  document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filePath = (btn as HTMLElement).dataset['path'] ?? '';
      const spec = state.specs.find((s) => s.filePath === filePath);
      if (spec) {
        state.editingSpec = { ...spec };
        state.isNew = false;
        render();
      }
    });
  });

  document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filePath = (btn as HTMLElement).dataset['path'] ?? '';
      postMessage({ command: 'deleteSpec', payload: { filePath } });
    });
  });
}

function bindEditorEvents(): void {
  document.getElementById('back-btn')?.addEventListener('click', () => {
    state.editingSpec = null;
    render();
  });

  document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
    state.editingSpec = null;
    render();
  });

  document.getElementById('add-tool-btn')?.addEventListener('click', () => {
    if (!state.editingSpec) {
      return;
    }
    state.editingSpec.tools = state.editingSpec.tools ?? [];
    state.editingSpec.tools.push({ name: '', description: '' });
    render();
  });

  document.querySelectorAll('.tool-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset['index'] ?? '0', 10);
      state.editingSpec!.tools?.splice(idx, 1);
      render();
    });
  });

  document.getElementById('save-spec-btn')?.addEventListener('click', () => {
    if (!state.editingSpec) {
      return;
    }

    const kind = (document.getElementById('spec-kind') as HTMLSelectElement).value as SpecKind;
    const name = (document.getElementById('spec-name') as HTMLInputElement).value.trim();
    const description = (document.getElementById('spec-desc') as HTMLTextAreaElement).value.trim();
    const preferredAgent = (document.getElementById('spec-preferred-agent') as HTMLSelectElement).value as AgentId;
    const fallbackAgent = (document.getElementById('spec-fallback-agent') as HTMLSelectElement).value as AgentId | '';

    const tools: SpecTool[] = [];
    document.querySelectorAll('.tool-row').forEach((row) => {
      const toolName = (row.querySelector('.tool-name') as HTMLInputElement).value.trim();
      const toolDesc = (row.querySelector('.tool-desc') as HTMLInputElement).value.trim();
      if (toolName) {
        tools.push({ name: toolName, description: toolDesc });
      }
    });

    const spec: SpecDefinition = {
      ...state.editingSpec,
      kind,
      name,
      description,
      tools,
      agents: {
        preferred: preferredAgent,
        ...(fallbackAgent ? { fallback: fallbackAgent } : {}),
      },
    };

    postMessage({ command: 'saveSpec', payload: spec });
    state.editingSpec = null;
    render();
  });
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  switch (msg.command) {
    case 'specsLoaded':
      state.specs = msg.payload as SpecDefinition[];
      if (!state.editingSpec) {
        render();
      }
      break;

    case 'specSaved': {
      const payload = msg.payload as { action: string };
      if (payload.action === 'new') {
        state.editingSpec = {
          kind: 'Skill',
          name: '',
          description: '',
          tools: [],
          agents: { preferred: 'copilot' },
        };
        state.isNew = true;
        render();
      }
      break;
    }

    case 'error':
      console.error('Spec Manager error:', msg.payload);
      break;
  }
});

function postMessage(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

// Inject styles
const style = document.createElement('style');
style.textContent = /* css */ `
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    margin: 0; padding: 0;
  }
  #root { padding: 0; }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
  }
  .toolbar__title {
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-sideBarSectionHeader-foreground);
  }

  .spec-list { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
  .spec-item {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 8px;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }
  .spec-item__header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .spec-item__name { font-weight: 600; }
  .spec-item__desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
  .spec-item__actions { display: flex; gap: 4px; }

  .empty-state { padding: 24px; text-align: center; color: var(--vscode-descriptionForeground); }
  .empty-state code { font-family: var(--vscode-editor-font-family); }

  .editor { padding: 0; }
  .editor__header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
  .editor__title { font-weight: 600; }
  .editor__form { padding: 8px 12px; display: flex; flex-direction: column; gap: 10px; }
  .editor__actions { display: flex; gap: 8px; }

  label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }

  .section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
  }

  .tool-row { display: flex; gap: 4px; align-items: center; }
  .tool-name { flex: 1; }
  .tool-desc { flex: 2; }
`;
document.head.appendChild(style);

document.getElementById('root')!.innerHTML = `<div class="toolbar"><span class="toolbar__title">Loading…</span></div>`;
postMessage({ command: 'ready' });
