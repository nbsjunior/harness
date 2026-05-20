<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

# Getting Started

Get Harness running in under 10 minutes.

Harness lets you use **Copilot, Claude, Cursor, Devin, and Kiro from one VS Code sidebar**, with **specs** and **file context** shared across providers. Read **[Why Harness](Why-Harness)** for the full picture.

## Requirements

| Requirement | Version |
|-------------|---------|
| VS Code | ≥ 1.85 |
| Node.js | ≥ 20 (on PATH — extension spawns the bundled CLI) |
| GitHub account | For Copilot (recommended first agent) |

## 1. Install the extension

**From release:** Download `harness-vscode.vsix` from [Releases](https://github.com/nbsjunior/harness/releases) → `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → Reload.

**From source:**

```bash
git clone https://github.com/nbsjunior/harness.git
cd harness
npm install
npm run package:vsix
code --install-extension packages/extension/harness-vscode.vsix
```

The `.vsix` includes the compiled CLI — no separate install needed.

## 2. Open Harness

1. Open a project folder in VS Code
2. Click the **Harness** icon in the Activity Bar (sidebar)
3. Wait for **Harness CLI daemon ready** in **View → Output → Harness**

## 3. Configure GitHub Copilot

1. `Ctrl+Shift+P` → **Harness: Copilot Login** (or run `gh auth login --scopes copilot`)
2. Open **Harness: Open Configuration** → verify Copilot shows ready
3. Run **Harness: Check getGoat** to confirm agents

## 4. Send your first message

1. In the chat panel, select **Copilot** at the bottom
2. Mode **Ask** (default)
3. Type a question → `Ctrl+Enter` or click **↑**

## Next steps

- [Chat Interface](Chat-Interface) — providers, modes, new chat
- [Copilot Modes](Copilot-Modes) — Ask / Agent / Spec+Agent
- [Configuration](Configuration) — all agents and API keys
- [Troubleshooting](Troubleshooting) — common errors
