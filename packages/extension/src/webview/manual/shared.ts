/** Shared user-manual markup for the dedicated manual panel and setup wizard. */

export function renderManualBody(): string {
  return /* html */`
    <article class="manual-doc">
      <header class="manual-doc__hero">
        <h1>ToddSpect — User Manual</h1>
        <p class="manual-doc__lead">
          One VS Code sidebar for Copilot, Claude, Cursor, Devin, and Kiro — shared file context,
          Spec-Driven Development, and a single conversation flow. No IDE hopping per provider.
        </p>
      </header>

      <section class="manual-section">
        <h2>1. Install</h2>
        <ol>
          <li>Download <code>toddspect-vscode-*.vsix</code> from
            <a href="https://github.com/nbsjunior/todd/releases">Releases</a>.</li>
          <li><code>Ctrl+Shift+P</code> → <strong>Extensions: Install from VSIX...</strong></li>
          <li><strong>Developer: Reload Window</strong></li>
          <li>Click the <strong>ToddSpect</strong> icon (fox) in the Activity Bar.</li>
        </ol>
      </section>

      <section class="manual-section">
        <h2>2. Welcome &amp; setup wizard</h2>
        <p>On first run, open configuration to see the welcome screen: unified chat, shared context, specs (SDD), and MCP.</p>
        <p>Click <strong>Get started →</strong> to configure agents, or <strong>Skip</strong> and configure later. The wizard ends with this manual before you finish setup.</p>
      </section>

      <section class="manual-section">
        <h2>3. Chat &amp; shared context</h2>
        <p>All providers share the same context chips and conversation panel.</p>
        <ul>
          <li>Right-click in Explorer → <strong>Add to ToddSpect Context</strong></li>
          <li><strong>+ New chat</strong> — new thread, keeps context</li>
          <li><strong>Clear context</strong> — removes file chips only</li>
          <li>View title → <strong>Clear Chat &amp; Context</strong> — full reset</li>
        </ul>
        <p>Provider pills: <strong>Auto</strong>, Copilot, Claude, Cursor, Devin, Kiro.
           Copilot modes: <strong>Ask</strong> | <strong>Agent</strong> | <strong>Spec+Agent</strong>.</p>
      </section>

      <section class="manual-section">
        <h2>4. Configure agents</h2>
        <p>Open <strong>ToddSpect: Open Configuration</strong> → <strong>Agents</strong>. Use <strong>Configure</strong> on each provider, then <strong>Test Connection</strong>. Tokens live in VS Code Secret Storage.</p>
      </section>

      <section class="manual-section">
        <h2>5. API servers</h2>
        <p>Built-in endpoints for Copilot, Devin, and Cursor. Add custom OpenAI-compatible servers with <strong>+ Add API server</strong>.</p>
      </section>

      <section class="manual-section">
        <h2>6. Commands</h2>
        <table class="manual-table">
          <thead><tr><th>Command</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>ToddSpect: Open User Manual</code></td><td>This guide</td></tr>
            <tr><td><code>ToddSpect: Open Configuration</code></td><td>Agents, MCP, workspace, spending</td></tr>
            <tr><td><code>ToddSpect: Initialize Workspace</code></td><td>Create <code>.toddspect/</code></td></tr>
            <tr><td><code>ToddSpect: Check getGoat</code></td><td>Agent readiness diagnostics</td></tr>
          </tbody>
        </table>
      </section>

      <section class="manual-section">
        <h2>7. Help</h2>
        <ul>
          <li><a href="https://github.com/nbsjunior/todd/wiki/Troubleshooting">Wiki: Troubleshooting</a></li>
          <li><a href="https://github.com/nbsjunior/todd/wiki/Auto-Routing">Wiki: Auto Routing</a></li>
          <li><a href="https://github.com/nbsjunior/todd/blob/main/docs/user-manual.md">docs/user-manual.md</a></li>
        </ul>
      </section>
    </article>`;
}

export const MANUAL_STYLES = /* css */`
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.55;
  }
  .manual-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .manual-toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
  }
  .manual-toolbar h1 { font-size: 14px; font-weight: 600; }
  .manual-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px 48px;
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
  }
  .manual-doc__hero { margin-bottom: 28px; }
  .manual-doc__hero h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
  .manual-doc__lead { color: var(--vscode-descriptionForeground); font-size: 13px; }
  .manual-section { margin-bottom: 28px; }
  .manual-section h2 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .manual-section p, .manual-section li { font-size: 13px; margin-bottom: 8px; }
  .manual-section ul, .manual-section ol { padding-left: 20px; margin-bottom: 10px; }
  .manual-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .manual-table th, .manual-table td {
    border: 1px solid var(--vscode-panel-border);
    padding: 8px 10px;
    text-align: left;
  }
  .manual-table th { background: var(--vscode-sideBar-background); }
  a { color: var(--vscode-textLink-foreground); }
  code {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-ghost {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border);
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .screen-footer {
    display: flex;
    justify-content: space-between;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-panel-border);
  }
`;
