import { marked } from 'marked';
import type {
  AgentId,
  SpecDefinition,
  SpecKind,
  SpecTool,
  ExtensionMessage,
  WebviewMessage,
  SddWorkflowStatus,
  SddStepId,
  SddStepState,
} from '../../types';
import { SDD_WORKFLOW_STEPS } from '../../types';

marked.setOptions({ breaks: true, gfm: true });

const vscode = acquireVsCodeApi();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type FilterKind = 'All' | SpecKind;
type ViewMode = 'specs' | 'workflow';

interface State {
  specs: SpecDefinition[];
  editingSpec: SpecDefinition | null;
  isNew: boolean;
  filterKind: FilterKind;
  expandedPath: string | null;
  validationError: string | null;
  viewMode: ViewMode;
  sddStatus: SddWorkflowStatus | null;
  showFeatureWizard: boolean;
  wizardName: string;
  wizardDescription: string;
  sddNotes: string;
}

const state: State = {
  specs: [],
  editingSpec: null,
  isNew: false,
  filterKind: 'All',
  expandedPath: null,
  validationError: null,
  viewMode: 'workflow',
  sddStatus: null,
  showFeatureWizard: false,
  wizardName: '',
  wizardDescription: '',
  sddNotes: '',
};

const FILTER_KINDS: FilterKind[] = ['All', 'Skill', 'Tool', 'Workflow'];
const AGENT_IDS: AgentId[] = ['copilot', 'devin', 'cursor', 'claude', 'kiro'];
const SPEC_KINDS: SpecKind[] = ['Skill', 'Tool', 'Workflow'];

const KIND_COLOR: Record<SpecKind, string> = {
  Skill:    '#0ea5e9',
  Tool:     '#7c3aed',
  Workflow: '#d97706',
};

const STARTER_TEMPLATES: Record<SpecKind, Partial<SpecDefinition>> = {
  Skill: {
    kind: 'Skill',
    name: 'my-skill',
    description: 'Describe what this skill enables the agent to do.',
    agents: { preferred: 'copilot' },
  },
  Tool: {
    kind: 'Tool',
    name: 'my-tool',
    description: 'Describe the external tool this spec exposes.',
    tools: [{ name: 'execute', description: 'Execute the tool with given parameters.' }],
    agents: { preferred: 'copilot' },
  },
  Workflow: {
    kind: 'Workflow',
    name: 'my-workflow',
    description: 'Describe the multi-step workflow this spec defines.',
    agents: { preferred: 'copilot' },
  },
};

// ---------------------------------------------------------------------------
// Root renderer
// ---------------------------------------------------------------------------

function render(): void {
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  if (state.editingSpec) {
    root.appendChild(renderEditor(state.editingSpec));
    return;
  }
  const shell = document.createElement('div');
  shell.className = 'pane';
  shell.appendChild(renderMainTabs());
  if (state.viewMode === 'workflow') {
    shell.appendChild(renderWorkflowPane());
  } else {
    const list = renderList();
    list.classList.remove('pane');
    list.classList.add('pane-body');
    shell.appendChild(list);
  }
  root.appendChild(shell);
}

function renderMainTabs(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'main-tabs';
  bar.innerHTML = `
    <button class="main-tab ${state.viewMode === 'workflow' ? 'main-tab--active' : ''}" data-mode="workflow">SDD Workflow</button>
    <button class="main-tab ${state.viewMode === 'specs' ? 'main-tab--active' : ''}" data-mode="specs">Specs</button>
    <a class="main-tab-link" href="https://github.com/github/spec-kit" title="GitHub spec-kit">spec-kit ↗</a>`;
  bar.querySelectorAll('.main-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.viewMode = (btn as HTMLElement).dataset['mode'] as ViewMode;
      if (state.viewMode === 'workflow') {
        postMessage({ command: 'loadSddWorkflow', payload: { activeFeatureId: state.sddStatus?.activeFeatureId } });
      }
      render();
    });
  });
  return bar;
}

// ---------------------------------------------------------------------------
// SDD Workflow (spec-kit)
// ---------------------------------------------------------------------------

function renderWorkflowPane(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pane-body workflow-pane';

  const status = state.sddStatus;
  if (!status) {
    el.innerHTML = `<div class="empty-state"><p class="empty-sub">Loading SDD workflow…</p></div>`;
    postMessage({ command: 'loadSddWorkflow', payload: {} });
    return el;
  }

  const featureOptions = status.features
    .map((f) => `<option value="${escapeAttr(f.id)}" ${status.activeFeatureId === f.id ? 'selected' : ''}>${escapeAttr(f.id)}</option>`)
    .join('');

  const stepRows = SDD_WORKFLOW_STEPS.map((meta) => {
    const st = status.steps.find((s) => s.id === meta.id) as SddStepState | undefined;
    const stepStatus = st?.status ?? 'locked';
    const artifact = st?.artifactPath ?? '';
    const canScaffold = meta.id !== 'analyze' && meta.id !== 'implement' && meta.id !== 'taskstoissues';
    return /* html */`
      <div class="wf-step wf-step--${stepStatus}" data-step="${meta.id}">
        <div class="wf-step__head">
          <span class="wf-step__status">${stepStatusIcon(stepStatus)}</span>
          <div class="wf-step__titles">
            <span class="wf-step__cmd">${meta.slashCommand}</span>
            <span class="wf-step__label">${meta.label}${meta.optional ? ' <em>(optional)</em>' : ''}</span>
          </div>
        </div>
        <p class="wf-step__desc">${meta.description}</p>
        <div class="wf-step__actions">
          ${canScaffold ? `<button class="btn-secondary btn-sm" data-wf-scaffold="${meta.id}">Scaffold</button>` : ''}
          ${artifact ? `<button class="btn-ghost btn-sm" data-wf-open="${escapeAttr(artifact)}">Open</button>` : ''}
          <button class="btn-primary btn-sm" data-wf-run="${meta.id}" ${stepStatus === 'locked' ? 'disabled' : ''}>Run in chat</button>
        </div>
      </div>`;
  }).join('');

  const wizardHtml = state.showFeatureWizard
    ? /* html */`
      <div class="wf-wizard">
        <div class="wf-wizard__title">New feature (spec-kit)</div>
        <input id="wf-name" class="text-input" placeholder="Feature name" value="${escapeAttr(state.wizardName)}" />
        <textarea id="wf-desc" class="text-input" rows="3" placeholder="What & why (optional)">${escapeAttr(state.wizardDescription)}</textarea>
        <div class="wf-wizard__actions">
          <button id="wf-cancel" class="btn-ghost btn-sm">Cancel</button>
          <button id="wf-create" class="btn-primary btn-sm">Create feature</button>
        </div>
      </div>`
    : '';

  el.innerHTML = /* html */`
    <div class="wf-toolbar">
      <button id="wf-init" class="btn-secondary btn-sm">${status.initialized ? 'Re-init SDD' : 'Initialize SDD'}</button>
      <button id="wf-new-feature" class="btn-primary btn-sm">+ New feature</button>
      <button id="wf-discover" class="btn-ghost btn-sm" title="Repo-based spec suggestions">Discover</button>
    </div>
    ${!status.initialized ? `<div class="wf-banner">Initialize <code>.toddspect/sdd/</code> to mirror <a href="https://github.com/github/spec-kit">spec-kit</a> (constitution → specify → plan → tasks → implement).</div>` : ''}
    ${wizardHtml}
    <div class="wf-feature-row">
      <label class="form-label">Active feature</label>
      <select id="wf-feature" class="select-input">
        <option value="">— Select feature —</option>
        ${featureOptions}
      </select>
    </div>
    <div class="wf-notes">
      <label class="form-label">Notes for next step (optional)</label>
      <textarea id="wf-notes" class="text-input" rows="2" placeholder="Extra context sent with Run in chat">${escapeAttr(state.sddNotes)}</textarea>
    </div>
    <div class="wf-pipeline">${stepRows}</div>
    <div class="wf-footer">
      <span class="wf-hint">Runs use <strong>Spec+Agent</strong> with SDD artifacts in context.</span>
    </div>`;

  el.querySelector('#wf-init')?.addEventListener('click', () => postMessage({ command: 'initSddWorkflow' }));
  el.querySelector('#wf-new-feature')?.addEventListener('click', () => {
    state.showFeatureWizard = true;
    render();
  });
  el.querySelector('#wf-discover')?.addEventListener('click', () => postMessage({ command: 'discoverSpecsRepo' }));
  el.querySelector('#wf-cancel')?.addEventListener('click', () => {
    state.showFeatureWizard = false;
    render();
  });
  el.querySelector('#wf-create')?.addEventListener('click', () => {
    const name = (el.querySelector('#wf-name') as HTMLInputElement)?.value.trim();
    if (!name) return;
    const description = (el.querySelector('#wf-desc') as HTMLTextAreaElement)?.value.trim();
    postMessage({ command: 'createSddFeature', payload: { name, description } });
    state.showFeatureWizard = false;
    state.wizardName = '';
    state.wizardDescription = '';
  });
  el.querySelector('#wf-feature')?.addEventListener('change', (e) => {
    const featureId = (e.target as HTMLSelectElement).value || null;
    postMessage({ command: 'selectSddFeature', payload: { featureId } });
  });
  el.querySelector('#wf-notes')?.addEventListener('input', (e) => {
    state.sddNotes = (e.target as HTMLTextAreaElement).value;
  });

  el.querySelectorAll('[data-wf-scaffold]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stepId = (btn as HTMLElement).dataset['wfScaffold'] as SddStepId;
      postMessage({
        command: 'writeSddArtifact',
        payload: { stepId, featureId: status.activeFeatureId },
      });
    });
  });
  el.querySelectorAll('[data-wf-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filePath = (btn as HTMLElement).dataset['wfOpen'] ?? '';
      postMessage({ command: 'openSddFile', payload: { filePath } });
    });
  });
  el.querySelectorAll('[data-wf-run]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stepId = (btn as HTMLElement).dataset['wfRun'] as SddStepId;
      postMessage({
        command: 'runSddStep',
        payload: {
          stepId,
          featureId: status.activeFeatureId,
          userNotes: state.sddNotes || undefined,
        },
      });
    });
  });

  return el;
}

function stepStatusIcon(status: string): string {
  switch (status) {
    case 'done': return '✓';
    case 'ready': return '○';
    case 'optional': return '◇';
    default: return '·';
  }
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function renderList(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pane';

  const filtered = state.filterKind === 'All'
    ? state.specs
    : state.specs.filter(s => s.kind === state.filterKind);

  const filterTabs = FILTER_KINDS.map(k => {
    const count = k === 'All' ? state.specs.length : state.specs.filter(s => s.kind === k).length;
    return `<button class="filter-tab ${state.filterKind === k ? 'filter-tab--active' : ''}" data-kind="${k}">${k} <span class="filter-count">${count}</span></button>`;
  }).join('');

  const listHtml = filtered.length === 0
    ? renderEmptyState()
    : filtered.map(spec => renderSpecCard(spec)).join('');

  el.innerHTML = /* html */`
    <div class="toolbar">
      <span class="toolbar__title">Spec Manager</span>
      <button id="new-spec-btn" class="btn-primary">+ New</button>
    </div>
    <div class="filter-bar">${filterTabs}</div>
    <div class="spec-list">${listHtml}</div>`;

  el.querySelector('#new-spec-btn')!.addEventListener('click', () => {
    openEditor({ ...STARTER_TEMPLATES.Skill, tools: [], agents: { preferred: 'copilot' } } as SpecDefinition, true);
  });

  el.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filterKind = (btn as HTMLElement).dataset['kind'] as FilterKind;
      state.expandedPath = null;
      render();
    });
  });

  el.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = (btn as HTMLElement).dataset['path'] ?? '';
      const spec = state.specs.find(s => s.filePath === path);
      if (spec) openEditor({ ...spec }, false);
    });
  });

  el.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = (btn as HTMLElement).dataset['path'] ?? '';
      postMessage({ command: 'deleteSpec', payload: { filePath: path } });
    });
  });

  el.querySelectorAll('.spec-card').forEach(card => {
    card.addEventListener('click', () => {
      const path = (card as HTMLElement).dataset['path'] ?? '';
      state.expandedPath = state.expandedPath === path ? null : path;
      render();
    });
  });

  return el;
}

function renderEmptyState(): string {
  if (state.specs.length === 0) {
    return /* html */`
      <div class="empty-state">
        <div class="empty-icon">&#9741;</div>
        <p class="empty-title">No specs yet</p>
        <p class="empty-sub">Create your first spec to guide agent behavior with reusable Skills, Tools and Workflows.</p>
        <div class="empty-actions">
          ${SPEC_KINDS.map(k => `
            <button class="btn-new-kind" data-kind="${k}" style="border-left-color:${KIND_COLOR[k]};">
              <span class="kind-dot" style="background:${KIND_COLOR[k]};"></span>${k}
            </button>`).join('')}
        </div>
      </div>`;
  }
  return `<div class="empty-state"><p class="empty-sub">No ${state.filterKind} specs found.</p></div>`;
}

function renderSpecCard(spec: SpecDefinition): string {
  const expanded = state.expandedPath === spec.filePath;
  const color = KIND_COLOR[spec.kind] ?? '#888';
  const preview = expanded && spec.description
    ? `<div class="spec-preview markdown-body">${marked.parse(spec.description) as string}</div>`
    : '';

  return /* html */`
    <div class="spec-card ${expanded ? 'spec-card--expanded' : ''}" data-path="${spec.filePath ?? ''}">
      <div class="spec-card__header">
        <span class="kind-badge" style="background:${color};">${spec.kind}</span>
        <span class="spec-card__name">${spec.name}</span>
        <div class="spec-card__actions">
          <button class="icon-btn" data-action="edit" data-path="${spec.filePath ?? ''}" title="Edit">&#9998;</button>
          <button class="icon-btn icon-btn--danger" data-action="delete" data-path="${spec.filePath ?? ''}" title="Delete">&#128465;</button>
          <span class="spec-card__chevron">${expanded ? '&#9650;' : '&#9660;'}</span>
        </div>
      </div>
      ${spec.description && !expanded
        ? `<div class="spec-card__desc">${spec.description.slice(0, 100)}${spec.description.length > 100 ? '…' : ''}</div>`
        : ''}
      ${preview}
      ${expanded && spec.agents
        ? `<div class="spec-card__footer">Agent: <strong>${spec.agents.preferred}</strong>${spec.agents.fallback ? ` / fallback: ${spec.agents.fallback}` : ''}</div>`
        : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Editor view
// ---------------------------------------------------------------------------

function openEditor(spec: SpecDefinition, isNew: boolean): void {
  state.editingSpec = spec;
  state.isNew = isNew;
  state.validationError = null;
  render();
}

function renderEditor(spec: SpecDefinition): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pane';

  const toolsHtml = (spec.tools ?? []).map((t, i) => `
    <div class="tool-row" data-index="${i}">
      <input class="text-input tool-name" value="${escapeAttr(t.name)}" placeholder="Tool name" />
      <input class="text-input tool-desc" value="${escapeAttr(t.description)}" placeholder="Description" style="flex:2;" />
      <button class="icon-btn icon-btn--danger tool-remove" data-index="${i}" title="Remove">&#10005;</button>
    </div>`).join('');

  el.innerHTML = /* html */`
    <div class="editor-header">
      <button id="back-btn" class="icon-btn" title="Back">&#8592;</button>
      <span class="editor-title">${state.isNew ? 'New Spec' : `Edit: ${spec.name}`}</span>
    </div>

    <div class="editor-form">
      <div class="form-row">
        <div class="form-group" style="flex:0 0 140px;">
          <label class="form-label">Kind</label>
          <select id="spec-kind" class="select-input">
            ${SPEC_KINDS.map(k => `<option value="${k}" ${spec.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label">Name</label>
          <input type="text" id="spec-name" class="text-input ${state.validationError ? 'input--error' : ''}"
            value="${escapeAttr(spec.name)}" placeholder="e.g. code-review" autocomplete="off" />
          ${state.validationError ? `<div class="validation-error">${state.validationError}</div>` : ''}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="spec-desc" class="text-input" rows="4" placeholder="What does this spec do? Supports Markdown.">${escapeAttr(spec.description)}</textarea>
      </div>

      <div class="form-group">
        <div class="section-label">Tools</div>
        <div id="tools-list" class="tools-list">${toolsHtml}</div>
        <button id="add-tool-btn" class="btn-secondary btn-sm">+ Add tool</button>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:1;">
          <label class="form-label">Preferred agent</label>
          <select id="spec-preferred-agent" class="select-input">
            ${AGENT_IDS.map(a => `<option value="${a}" ${spec.agents?.preferred === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label">Fallback agent</label>
          <select id="spec-fallback-agent" class="select-input">
            <option value="">None</option>
            ${AGENT_IDS.map(a => `<option value="${a}" ${spec.agents?.fallback === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="editor-footer">
      <button id="cancel-edit-btn" class="btn-ghost">Cancel</button>
      <button id="save-spec-btn" class="btn-primary">Save Spec</button>
    </div>`;

  el.querySelector('#back-btn')!.addEventListener('click', () => { state.editingSpec = null; render(); });
  el.querySelector('#cancel-edit-btn')!.addEventListener('click', () => { state.editingSpec = null; render(); });

  el.querySelector('#add-tool-btn')!.addEventListener('click', () => {
    state.editingSpec!.tools = state.editingSpec!.tools ?? [];
    state.editingSpec!.tools.push({ name: '', description: '' });
    render();
  });

  el.querySelectorAll('.tool-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset['index'] ?? '0', 10);
      state.editingSpec!.tools?.splice(idx, 1);
      render();
    });
  });

  const nameInput = el.querySelector('#spec-name') as HTMLInputElement;
  nameInput.addEventListener('input', () => {
    if (state.validationError && nameInput.value.trim()) {
      state.validationError = null;
      nameInput.classList.remove('input--error');
      const errEl = el.querySelector('.validation-error');
      if (errEl) errEl.remove();
    }
  });

  const saveBtn = el.querySelector('#save-spec-btn') as HTMLButtonElement;
  saveBtn.addEventListener('click', () => {
    const kind = (el.querySelector('#spec-kind') as HTMLSelectElement).value as SpecKind;
    const name = (el.querySelector('#spec-name') as HTMLInputElement).value.trim();
    const description = (el.querySelector('#spec-desc') as HTMLTextAreaElement).value.trim();
    const preferredAgent = (el.querySelector('#spec-preferred-agent') as HTMLSelectElement).value as AgentId;
    const fallbackAgent = (el.querySelector('#spec-fallback-agent') as HTMLSelectElement).value as AgentId | '';

    if (!name) {
      state.validationError = 'Name is required.';
      render();
      return;
    }

    const tools: SpecTool[] = [];
    el.querySelectorAll('.tool-row').forEach(row => {
      const toolName = (row.querySelector('.tool-name') as HTMLInputElement).value.trim();
      const toolDesc = (row.querySelector('.tool-desc') as HTMLInputElement).value.trim();
      if (toolName) tools.push({ name: toolName, description: toolDesc });
    });

    const finalSpec: SpecDefinition = {
      ...state.editingSpec!,
      kind,
      name,
      description,
      tools,
      agents: {
        preferred: preferredAgent,
        ...(fallbackAgent ? { fallback: fallbackAgent } : {}),
      },
    };

    postMessage({ command: 'saveSpec', payload: finalSpec });
    state.editingSpec = null;
    render();
  });

  return el;
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  switch (msg.command) {
    case 'specsLoaded':
      state.specs = msg.payload as SpecDefinition[];
      if (!state.editingSpec) render();
      break;

    case 'specSaved': {
      const payload = msg.payload as { action: string };
      if (payload.action === 'new') {
        openEditor({ ...STARTER_TEMPLATES.Skill, tools: [], agents: { preferred: 'copilot' } } as SpecDefinition, true);
      }
      break;
    }

    case 'sddWorkflowLoaded':
      state.sddStatus = (msg.payload as { status: SddWorkflowStatus }).status;
      if (!state.editingSpec) render();
      break;

    case 'sddWorkflowUpdated':
      state.sddStatus = (msg.payload as { status: SddWorkflowStatus }).status;
      if (!state.editingSpec) render();
      break;

    case 'error':
      console.error('Spec Manager error:', msg.payload);
      break;
  }
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function postMessage(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

function escapeAttr(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  background: var(--vscode-sideBar-background);
}

#root { height: 100%; }
.pane { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── Toolbar ─────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  flex-shrink: 0;
}
.toolbar__title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--vscode-sideBarSectionHeader-foreground);
}

/* ── Filter tabs ─────────────────────────────────────── */
.filter-bar {
  display: flex;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  flex-shrink: 0;
  overflow-x: auto;
}
.filter-tab {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-family: var(--vscode-font-family);
  cursor: pointer;
  opacity: 0.6;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}
.filter-tab:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.filter-tab--active {
  opacity: 1;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}
.filter-count {
  background: rgba(128,128,128,0.25);
  border-radius: 8px;
  padding: 0 5px;
  font-size: 10px;
}
.filter-tab--active .filter-count { background: rgba(255,255,255,0.2); }

/* ── Spec list ───────────────────────────────────────── */
.spec-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Empty state ─────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
  text-align: center;
  gap: 8px;
  color: var(--vscode-descriptionForeground);
}
.empty-icon { font-size: 32px; opacity: 0.3; }
.empty-title { font-size: 14px; font-weight: 600; color: var(--vscode-foreground); }
.empty-sub { font-size: 12px; max-width: 240px; line-height: 1.5; }
.empty-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; width: 100%; max-width: 200px; }
.btn-new-kind {
  background: var(--vscode-editor-inactiveSelectionBackground);
  color: var(--vscode-foreground);
  border: none;
  border-left: 3px solid transparent;
  border-radius: 5px;
  padding: 7px 14px;
  font-size: 12px;
  font-family: var(--vscode-font-family);
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-new-kind:hover { background: var(--vscode-list-hoverBackground); }
.kind-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* ── Spec card ───────────────────────────────────────── */
.spec-card {
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  padding: 8px 10px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  cursor: pointer;
  transition: border-color 0.12s;
}
.spec-card:hover { border-color: var(--vscode-focusBorder); }
.spec-card--expanded { border-color: var(--vscode-focusBorder); }

.spec-card__header {
  display: flex;
  align-items: center;
  gap: 7px;
}
.kind-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #fff;
  padding: 2px 7px;
  border-radius: 8px;
  flex-shrink: 0;
}
.spec-card__name { font-weight: 600; font-size: 12px; flex: 1; }
.spec-card__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.1s;
}
.spec-card:hover .spec-card__actions { opacity: 1; }
.spec-card__chevron { font-size: 9px; color: var(--vscode-descriptionForeground); margin-left: 4px; }

.spec-card__desc {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 4px;
}
.spec-card__footer {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--vscode-widget-border);
}

.spec-preview {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--vscode-widget-border);
  font-size: 12px;
  line-height: 1.6;
  color: var(--vscode-foreground);
}

/* Markdown in preview */
.markdown-body p { margin: 0 0 6px; }
.markdown-body p:last-child { margin-bottom: 0; }
.markdown-body ul, .markdown-body ol { padding-left: 18px; margin: 4px 0; }
.markdown-body code {
  background: var(--vscode-textCodeBlock-background);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
}

/* ── Editor ──────────────────────────────────────────── */
.editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  flex-shrink: 0;
}
.editor-title { font-weight: 600; font-size: 13px; }

.editor-form {
  flex: 1;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
  flex-shrink: 0;
}

.form-row { display: flex; gap: 10px; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-label { font-size: 11px; font-weight: 600; }
.section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vscode-descriptionForeground);
  font-weight: 600;
  margin-bottom: 4px;
}

.text-input {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
  padding: 5px 8px;
  border-radius: 4px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  resize: vertical;
}
.text-input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
.input--error { border-color: var(--vscode-inputValidation-errorBorder) !important; }
.validation-error {
  font-size: 11px;
  color: var(--vscode-errorForeground);
  margin-top: 2px;
}

.select-input {
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border);
  padding: 5px 8px;
  border-radius: 4px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  width: 100%;
}

.tools-list { display: flex; flex-direction: column; gap: 4px; }
.tool-row { display: flex; gap: 6px; align-items: center; }
.tool-name { flex: 1; }

/* ── Buttons ─────────────────────────────────────────── */
.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 4px;
  padding: 5px 14px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  cursor: pointer;
  font-weight: 500;
}
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  border-radius: 4px;
  padding: 5px 12px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  cursor: pointer;
}
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
.btn-sm { padding: 3px 10px; font-size: 11px; }

.btn-ghost {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  padding: 5px 10px;
  border-radius: 4px;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
  cursor: pointer;
  opacity: 0.7;
}
.btn-ghost:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

.icon-btn {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 3px;
  font-size: 13px;
  opacity: 0.6;
  line-height: 1;
  flex-shrink: 0;
}
.icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.icon-btn--danger:hover { color: var(--vscode-errorForeground); }

/* ── Main tabs & SDD workflow ────────────────────────── */
.main-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  flex-shrink: 0;
}
.main-tab {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-family: var(--vscode-font-family);
  cursor: pointer;
  opacity: 0.65;
}
.main-tab:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.main-tab--active {
  opacity: 1;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}
.main-tab-link {
  margin-left: auto;
  font-size: 10px;
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
  opacity: 0.8;
}
.pane-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }
.workflow-pane { padding: 8px; gap: 8px; }
.wf-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.wf-banner {
  font-size: 11px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--vscode-inputValidation-infoBackground);
  border: 1px solid var(--vscode-inputValidation-infoBorder);
  margin-bottom: 8px;
  line-height: 1.45;
}
.wf-banner code { font-size: 10px; }
.wf-wizard {
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wf-wizard__title { font-weight: 600; font-size: 12px; }
.wf-wizard__actions { display: flex; gap: 6px; justify-content: flex-end; }
.wf-feature-row, .wf-notes { margin-bottom: 8px; }
.wf-pipeline { display: flex; flex-direction: column; gap: 6px; }
.wf-step {
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  padding: 8px 10px;
  background: var(--vscode-editor-inactiveSelectionBackground);
}
.wf-step--done { border-left: 3px solid var(--vscode-testing-iconPassed); }
.wf-step--ready { border-left: 3px solid var(--vscode-focusBorder); }
.wf-step--optional { border-left: 3px solid var(--vscode-descriptionForeground); opacity: 0.9; }
.wf-step--locked { opacity: 0.55; }
.wf-step__head { display: flex; gap: 8px; align-items: flex-start; }
.wf-step__status { font-size: 14px; width: 18px; flex-shrink: 0; }
.wf-step__cmd { font-size: 10px; font-family: var(--vscode-editor-font-family); color: var(--vscode-textLink-foreground); display: block; }
.wf-step__label { font-size: 12px; font-weight: 600; }
.wf-step__desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 4px 0 6px 26px; }
.wf-step__actions { display: flex; flex-wrap: wrap; gap: 4px; margin-left: 26px; }
.wf-footer { margin-top: 8px; font-size: 10px; color: var(--vscode-descriptionForeground); }
.wf-hint strong { color: var(--vscode-foreground); }
`;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const styleEl = document.createElement('style');
styleEl.textContent = CSS;
document.head.appendChild(styleEl);

document.getElementById('root')!.innerHTML = `<div class="pane"><div class="toolbar"><span class="toolbar__title">Loading…</span></div></div>`;
postMessage({ command: 'ready' });
