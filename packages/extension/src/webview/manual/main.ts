import { MANUAL_STYLES, renderManualBody, type ManualImageUrls } from './shared.js';

const vscode = acquireVsCodeApi();

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = MANUAL_STYLES;
  document.head.appendChild(style);
}

function render(images: ManualImageUrls): void {
  const root = document.getElementById('root')!;
  root.className = 'manual-shell';
  root.innerHTML = /* html */`
    <header class="manual-toolbar">
      <h1>Harness of AI — User Manual</h1>
      <button type="button" id="btn-open-chat" class="btn-primary">Open Chat</button>
    </header>
    <main class="manual-scroll" id="manual-scroll"></main>`;

  const scroll = root.querySelector('#manual-scroll') as HTMLElement;
  scroll.innerHTML = renderManualBody(images);

  root.querySelector('#btn-open-chat')!.addEventListener('click', () => {
    vscode.postMessage({ command: 'openChat' });
  });
}

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { command: string; payload?: ManualImageUrls };
  if (msg.command === 'manualImages' && msg.payload) {
    render(msg.payload);
  }
});

injectStyles();
document.getElementById('root')!.innerHTML =
  '<p style="padding:24px;color:var(--vscode-descriptionForeground)">Loading manual…</p>';
vscode.postMessage({ command: 'ready' });
