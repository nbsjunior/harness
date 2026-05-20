import { MANUAL_STYLES, renderManualBody } from './shared.js';

const vscode = acquireVsCodeApi();

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = MANUAL_STYLES;
  document.head.appendChild(style);
}

function render(): void {
  const root = document.getElementById('root')!;
  root.className = 'manual-shell';
  root.innerHTML = /* html */`
    <header class="manual-toolbar">
      <h1>Harness of AI — User Manual</h1>
      <button type="button" id="btn-open-chat" class="btn-primary">Open Chat</button>
    </header>
    <main class="manual-scroll" id="manual-scroll"></main>`;

  const scroll = root.querySelector('#manual-scroll') as HTMLElement;
  scroll.innerHTML = renderManualBody();

  root.querySelector('#btn-open-chat')!.addEventListener('click', () => {
    vscode.postMessage({ command: 'openChat' });
  });
}

injectStyles();
render();
